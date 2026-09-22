import type {ICourse, ILessonProgress, IMediaLesson, IRecentCourse, TCourseProgress} from '../../shared/types';

interface IProgressMutation {
  revision: number;
  progress: ILessonProgress | null;
}

interface IProgressMutationState {
  courseClearRevision: number;
  lessons: Map<string, IProgressMutation>;
  pendingRevisions: Set<number>;
}

interface IProgressReadSnapshot {
  revision: number;
  pendingRevisions: Set<number>;
}

type TProgressWriteKind = 'save' | 'clear-lesson' | 'clear-course';

interface IProgressWrite {
  courseId: string;
  kind: TProgressWriteKind;
  lessonId?: string;
  previousCourseProgress?: TCourseProgress;
  previousProgress?: ILessonProgress;
  progress?: ILessonProgress;
  revision: number;
  status: 'failed' | 'queued';
}

export function useCourseLibrary() {
  const recentCourses = useState<IRecentCourse[]>('course-shelf-recent', () => []);
  const openCourses = useState<ICourse[]>('course-shelf-open', () => []);
  const activeTab = useState<string>('course-shelf-active-tab', () => 'library');
  const progressByCourse = useState<Record<string, TCourseProgress>>('course-shelf-progress', () => ({}));
  const selectedLessonByCourse = useState<Record<string, string>>('course-shelf-selected-lesson', () => ({}));
  const loading = useState<boolean>('course-shelf-loading', () => false);
  const loadingMessage = useState<string>('course-shelf-loading-message', () => 'Scanning your folder…');
  const error = useState<string>('course-shelf-error', () => '');
  const progressError = useState<string>('course-shelf-progress-error', () => '');
  let progressWriteQueue: Promise<void> = Promise.resolve();
  let operationGeneration = 0;
  const progressRevisionByCourse = new Map<string, number>();
  const progressMutationsByCourse = new Map<string, IProgressMutationState>();
  const progressWrites = new Map<string, IProgressWrite>();

  const currentCourse = computed(() => openCourses.value.find((course) => course.id === activeTab.value) ?? null);
  const currentLesson = computed(() => {
    const course = currentCourse.value;
    if (!course) {
      return null;
    }
    const selectedLessonId = selectedLessonByCourse.value[course.id];
    return course.lessons.find((lesson) => lesson.id === selectedLessonId) ?? course.lessons[0] ?? null;
  });

  function getApi() {
    return import.meta.client ? window.courseShelf : null;
  }

  function messageFor(cause: unknown, fallback: string) {
    if (cause instanceof Error && cause.message.trim()) {
      return cause.message;
    }
    return fallback;
  }

  function beginOperation(message: string) {
    const generation = ++operationGeneration;
    loading.value = true;
    loadingMessage.value = message;
    error.value = '';
    return generation;
  }

  function isCurrentOperation(generation: number) {
    return generation === operationGeneration;
  }

  function endOperation(generation: number) {
    if (!isCurrentOperation(generation)) {
      return;
    }
    loading.value = false;
    loadingMessage.value = '';
  }

  function invalidatePendingOperations() {
    operationGeneration += 1;
    loading.value = false;
    loadingMessage.value = '';
  }

  function enqueueProgressWrite(write: () => Promise<void>) {
    const nextWrite = progressWriteQueue.then(write, write);
    progressWriteQueue = nextWrite.catch(() => undefined);
    return nextWrite;
  }

  function progressFor(courseId: string) {
    return progressByCourse.value[courseId] ?? {};
  }

  function findResumeLesson(course: ICourse) {
    const progress = progressFor(course.id);
    const inProgressLessons = course.lessons
      .filter((lesson) => {
        const lessonState = progress[lesson.id];
        return Boolean(lessonState && !lessonState.completed && lessonState.position > 1);
      })
      .sort((left, right) => (progress[right.id]?.updatedAt ?? 0) - (progress[left.id]?.updatedAt ?? 0));
    return inProgressLessons[0] ?? course.lessons.find((lesson) => !progress[lesson.id]?.completed) ?? course.lessons[0] ?? null;
  }

  function mutationStateFor(courseId: string) {
    const existing = progressMutationsByCourse.get(courseId);
    if (existing) {
      return existing;
    }
    const state: IProgressMutationState = {
      courseClearRevision: 0,
      lessons: new Map(),
      pendingRevisions: new Set(),
    };
    progressMutationsByCourse.set(courseId, state);
    return state;
  }

  function nextProgressRevision(courseId: string) {
    const revision = (progressRevisionByCourse.get(courseId) ?? 0) + 1;
    progressRevisionByCourse.set(courseId, revision);
    mutationStateFor(courseId).pendingRevisions.add(revision);
    return revision;
  }

  function recordLessonMutation(courseId: string, lessonId: string, progress: ILessonProgress | null) {
    const revision = nextProgressRevision(courseId);
    mutationStateFor(courseId).lessons.set(lessonId, {revision, progress});
    return revision;
  }

  function recordCourseClear(courseId: string) {
    const revision = nextProgressRevision(courseId);
    mutationStateFor(courseId).courseClearRevision = revision;
    return revision;
  }

  function progressReadSnapshot(courseId: string): IProgressReadSnapshot {
    const state = progressMutationsByCourse.get(courseId);
    return {
      revision: progressRevisionByCourse.get(courseId) ?? 0,
      pendingRevisions: new Set(state?.pendingRevisions ?? []),
    };
  }

  function mergeProgressRead(courseId: string, loadedProgress: TCourseProgress, snapshot: IProgressReadSnapshot) {
    const state = progressMutationsByCourse.get(courseId);
    if (!state) {
      return loadedProgress;
    }

    const mergedProgress = {...loadedProgress};
    const courseWasLocallyCleared = state.courseClearRevision > 0;
    if (courseWasLocallyCleared) {
      for (const lessonId of Object.keys(mergedProgress)) {
        delete mergedProgress[lessonId];
      }
    }

    for (const [lessonId, mutation] of state.lessons) {
      if (courseWasLocallyCleared && mutation.revision <= state.courseClearRevision) {
        continue;
      }
      const mutationMustWin = mutation.revision > snapshot.revision
        || snapshot.pendingRevisions.has(mutation.revision)
        || (courseWasLocallyCleared && mutation.revision > state.courseClearRevision);
      if (!mutationMustWin) {
        continue;
      }
      if (mutation.progress) {
        mergedProgress[lessonId] = mutation.progress;
      } else {
        delete mergedProgress[lessonId];
      }
    }
    return mergedProgress;
  }

  function progressWriteKey(write: IProgressWrite) {
    return `${write.courseId}:${write.revision}:${write.kind}:${write.lessonId ?? ''}`;
  }

  function markProgressPersisted(write: IProgressWrite) {
    mutationStateFor(write.courseId).pendingRevisions.delete(write.revision);
    progressWrites.delete(progressWriteKey(write));
  }

  function hasFailedProgressWrites() {
    return [...progressWrites.values()].some((write) => write.status === 'failed');
  }

  function isCurrentProgressWrite(write: IProgressWrite) {
    const state = mutationStateFor(write.courseId);
    if (write.kind === 'clear-course') {
      const rolledBackFailedClear = write.status === 'failed' && state.courseClearRevision === 0;
      return (state.courseClearRevision === write.revision || rolledBackFailedClear)
        && (progressRevisionByCourse.get(write.courseId) ?? 0) === write.revision;
    }
    return state.lessons.get(write.lessonId ?? '')?.revision === write.revision
      && state.courseClearRevision <= write.revision;
  }

  function rollbackFailedClear(write: IProgressWrite) {
    if (write.kind === 'save' || !isCurrentProgressWrite(write)) {
      return;
    }

    const nextProgress = {...progressByCourse.value};
    if (write.kind === 'clear-course') {
      if (write.previousCourseProgress && Object.keys(write.previousCourseProgress).length > 0) {
        nextProgress[write.courseId] = {...write.previousCourseProgress};
      } else {
        delete nextProgress[write.courseId];
      }
    } else {
      const courseProgress = {...(nextProgress[write.courseId] ?? {})};
      if (write.previousProgress) {
        courseProgress[write.lessonId ?? ''] = write.previousProgress;
      } else {
        delete courseProgress[write.lessonId ?? ''];
      }
      if (Object.keys(courseProgress).length > 0) {
        nextProgress[write.courseId] = courseProgress;
      } else {
        delete nextProgress[write.courseId];
      }
    }
    progressByCourse.value = nextProgress;
    const state = mutationStateFor(write.courseId);
    state.pendingRevisions.delete(write.revision);
    if (write.kind === 'clear-course') {
      state.courseClearRevision = 0;
    }
  }

  async function persistProgressWrite(write: IProgressWrite, fallback: string) {
    const api = getApi();
    if (!api) {
      markProgressPersisted(write);
      return;
    }
    write.status = 'queued';
    try {
      await enqueueProgressWrite(async () => {
        if (write.kind === 'save' && write.progress) {
          await api.saveLessonProgress({courseId: write.courseId, lessonId: write.lessonId ?? '', progress: write.progress});
        } else if (write.kind === 'clear-lesson') {
          await api.clearLessonProgress(write.courseId, write.lessonId ?? '');
        } else {
          await api.clearCourseProgress(write.courseId);
        }
      });
      markProgressPersisted(write);
      if (!hasFailedProgressWrites()) {
        progressError.value = '';
      }
    } catch (cause) {
      write.status = 'failed';
      rollbackFailedClear(write);
      progressError.value = messageFor(cause, fallback);
      throw cause;
    }
  }

  function discardProgressWrite(write: IProgressWrite) {
    const state = mutationStateFor(write.courseId);
    state.pendingRevisions.delete(write.revision);
    if (write.kind === 'clear-course' && state.courseClearRevision === write.revision) {
      state.courseClearRevision = 0;
    }
    progressWrites.delete(progressWriteKey(write));
  }

  async function loadCourseProgress(course: ICourse, generation: number) {
    const api = getApi();
    if (!api) {
      return true;
    }
    const snapshot = progressReadSnapshot(course.id);
    const loadedProgress = await api.getCourseProgress(course.id);
    if (!isCurrentOperation(generation)) {
      return false;
    }
    const nextProgress = mergeProgressRead(course.id, loadedProgress ?? {}, snapshot);
    progressByCourse.value = {
      ...progressByCourse.value,
      [course.id]: nextProgress,
    };
    return true;
  }

  async function openCourse(course: ICourse, generation: number) {
    if (!await loadCourseProgress(course, generation) || !isCurrentOperation(generation)) {
      return false;
    }

    const existingCourse = openCourses.value.find((openCourse) => openCourse.id === course.id);
    openCourses.value = existingCourse
      ? openCourses.value.map((openCourse) => openCourse.id === course.id ? course : openCourse)
      : [...openCourses.value, course];

    const selectedLessonId = selectedLessonByCourse.value[course.id];
    if (!course.lessons.some((lesson) => lesson.id === selectedLessonId)) {
      selectedLessonByCourse.value = {
        ...selectedLessonByCourse.value,
        [course.id]: findResumeLesson(course)?.id ?? '',
      };
    }
    activeTab.value = course.id;
    return true;
  }

  async function load() {
    const api = getApi();
    if (!api) {
      return;
    }
    const generation = beginOperation('Loading your course library…');
    try {
      const loadedRecentCourses = await api.getRecentCourses();
      if (!isCurrentOperation(generation)) {
        return;
      }
      recentCourses.value = loadedRecentCourses;

      const restoredCourse = await api.restoreLastCourse();
      if (!restoredCourse || !isCurrentOperation(generation)) {
        return;
      }
      if (await openCourse(restoredCourse, generation) && isCurrentOperation(generation)) {
        const refreshedRecentCourses = await api.getRecentCourses();
        if (isCurrentOperation(generation)) {
          recentCourses.value = refreshedRecentCourses;
        }
      }
    } catch (cause) {
      if (isCurrentOperation(generation)) {
        error.value = messageFor(cause, 'The course library could not be loaded.');
      }
    } finally {
      endOperation(generation);
    }
  }

  async function openFolder() {
    const api = getApi();
    if (!api) {
      return;
    }
    const generation = beginOperation('Scanning your folder…');
    try {
      const course = await api.chooseFolder();
      if (!course || !isCurrentOperation(generation)) {
        return;
      }
      const refreshedRecentCourses = await api.getRecentCourses();
      if (!isCurrentOperation(generation)) {
        return;
      }
      recentCourses.value = refreshedRecentCourses;
      if (isCurrentOperation(generation)) {
        await openCourse(course, generation);
      }
    } catch (cause) {
      if (isCurrentOperation(generation)) {
        error.value = messageFor(cause, 'The selected folder could not be opened.');
      }
    } finally {
      endOperation(generation);
    }
  }

  async function openRecentCourse(recentCourse: IRecentCourse) {
    const api = getApi();
    if (!api) {
      return;
    }
    const generation = beginOperation('Opening your course…');
    try {
      const course = await api.openRecentCourse(recentCourse.rootPath);
      if (!course || !isCurrentOperation(generation)) {
        return;
      }
      const refreshedRecentCourses = await api.getRecentCourses();
      if (!isCurrentOperation(generation)) {
        return;
      }
      recentCourses.value = refreshedRecentCourses;
      if (isCurrentOperation(generation)) {
        await openCourse(course, generation);
      }
    } catch (cause) {
      if (isCurrentOperation(generation)) {
        error.value = messageFor(cause, 'The recent folder could not be opened.');
      }
    } finally {
      endOperation(generation);
    }
  }

  async function removeRecentCourse(recentCourse: IRecentCourse) {
    const api = getApi();
    if (!api) {
      return;
    }
    const generation = beginOperation('Removing the course…');
    try {
      await api.removeRecentCourse(recentCourse.rootPath);
      if (!isCurrentOperation(generation)) {
        return;
      }
      recentCourses.value = recentCourses.value.filter((candidate) => candidate.id !== recentCourse.id);
      closeCourseState(recentCourse.id);
      try {
        const refreshedRecentCourses = await api.getRecentCourses();
        if (isCurrentOperation(generation)) {
          recentCourses.value = refreshedRecentCourses;
        }
      } catch (cause) {
        if (isCurrentOperation(generation)) {
          error.value = messageFor(cause, 'The course was removed, but the collection could not be refreshed.');
        }
      }
    } catch (cause) {
      if (isCurrentOperation(generation)) {
        error.value = messageFor(cause, 'The course could not be removed from the collection.');
      }
    } finally {
      endOperation(generation);
    }
  }

  function selectLesson(lesson: IMediaLesson) {
    const course = currentCourse.value;
    if (!course || !course.lessons.some((candidate) => candidate.id === lesson.id)) {
      return;
    }
    invalidatePendingOperations();
    selectedLessonByCourse.value = {
      ...selectedLessonByCourse.value,
      [course.id]: lesson.id,
    };
  }

  function closeCourseState(courseId: string) {
    const courseIndex = openCourses.value.findIndex((course) => course.id === courseId);
    if (courseIndex === -1) {
      if (activeTab.value !== 'library' && !openCourses.value.some((course) => course.id === activeTab.value)) {
        activeTab.value = 'library';
      }
      return;
    }

    openCourses.value = openCourses.value.filter((course) => course.id !== courseId);
    if (activeTab.value === courseId) {
      const nextCourse = openCourses.value[courseIndex] ?? openCourses.value[courseIndex - 1];
      activeTab.value = nextCourse?.id ?? 'library';
    } else if (activeTab.value !== 'library' && !openCourses.value.some((course) => course.id === activeTab.value)) {
      activeTab.value = 'library';
    }
  }

  function closeCourse(courseId: string) {
    invalidatePendingOperations();
    closeCourseState(courseId);
  }

  function setActiveTab(tabId: string) {
    invalidatePendingOperations();
    activeTab.value = tabId === 'library' || openCourses.value.some((course) => course.id === tabId) ? tabId : 'library';
  }

  function lessonProgress(courseId: string, lessonId: string): ILessonProgress | null {
    return progressByCourse.value[courseId]?.[lessonId] ?? null;
  }

  async function saveProgress(courseId: string, lessonId: string, progress: ILessonProgress) {
    const revision = recordLessonMutation(courseId, lessonId, progress);
    progressByCourse.value = {
      ...progressByCourse.value,
      [courseId]: {
        ...(progressByCourse.value[courseId] ?? {}),
        [lessonId]: progress,
      },
    };
    const api = getApi();
    if (!api) {
      mutationStateFor(courseId).pendingRevisions.delete(revision);
      return;
    }
    const write: IProgressWrite = {courseId, kind: 'save', lessonId, progress, revision, status: 'queued'};
    progressWrites.set(progressWriteKey(write), write);
    await persistProgressWrite(write, 'The saved progress could not be updated.');
  }

  async function clearLessonProgress(courseId: string, lessonId: string) {
    const previousProgress = progressByCourse.value[courseId]?.[lessonId];
    const revision = recordLessonMutation(courseId, lessonId, null);
    const courseProgress = {...(progressByCourse.value[courseId] ?? {})};
    delete courseProgress[lessonId];
    const nextProgress = {...progressByCourse.value};
    if (Object.keys(courseProgress).length === 0) {
      delete nextProgress[courseId];
    } else {
      nextProgress[courseId] = courseProgress;
    }
    progressByCourse.value = nextProgress;
    const api = getApi();
    if (!api) {
      mutationStateFor(courseId).pendingRevisions.delete(revision);
      return;
    }
    const write: IProgressWrite = {
      courseId,
      kind: 'clear-lesson',
      lessonId,
      previousProgress: previousProgress ? {...previousProgress} : undefined,
      revision,
      status: 'queued',
    };
    progressWrites.set(progressWriteKey(write), write);
    await persistProgressWrite(write, 'The saved progress could not be cleared.');
  }

  async function clearCourseProgress(courseId: string) {
    const previousCourseProgress = progressByCourse.value[courseId]
      ? {...progressByCourse.value[courseId]}
      : undefined;
    const revision = recordCourseClear(courseId);
    const nextProgress = {...progressByCourse.value};
    delete nextProgress[courseId];
    progressByCourse.value = nextProgress;
    const api = getApi();
    if (!api) {
      mutationStateFor(courseId).pendingRevisions.delete(revision);
      return;
    }
    const write: IProgressWrite = {
      courseId,
      kind: 'clear-course',
      previousCourseProgress,
      revision,
      status: 'queued',
    };
    progressWrites.set(progressWriteKey(write), write);
    await persistProgressWrite(write, 'The saved course progress could not be cleared.');
  }

  async function retryProgressWrites() {
    const failedWrites = [...progressWrites.values()]
      .filter((write) => write.status === 'failed')
      .sort((left, right) => left.revision - right.revision);
    let allSucceeded = true;

    for (const failedWrite of failedWrites) {
      if (!isCurrentProgressWrite(failedWrite)) {
        discardProgressWrite(failedWrite);
        continue;
      }
      discardProgressWrite(failedWrite);
      try {
        if (failedWrite.kind === 'save' && failedWrite.lessonId && failedWrite.progress) {
          await saveProgress(failedWrite.courseId, failedWrite.lessonId, failedWrite.progress);
        } else if (failedWrite.kind === 'clear-lesson' && failedWrite.lessonId) {
          await clearLessonProgress(failedWrite.courseId, failedWrite.lessonId);
        } else if (failedWrite.kind === 'clear-course') {
          await clearCourseProgress(failedWrite.courseId);
        }
      } catch {
        allSucceeded = false;
      }
    }

    if (allSucceeded && !hasFailedProgressWrites()) {
      progressError.value = '';
    }
    return allSucceeded;
  }

  async function toggleComplete(lesson: IMediaLesson) {
    const course = currentCourse.value;
    if (!course || !course.lessons.some((candidate) => candidate.id === lesson.id)) {
      return;
    }
    const previous = lessonProgress(course.id, lesson.id);
    try {
      await saveProgress(course.id, lesson.id, {
        position: previous?.position ?? 0,
        duration: previous?.duration || lesson.duration || 0,
        completed: !previous?.completed,
        updatedAt: Date.now(),
      });
    } catch {
      // saveProgress records the failure and still rejects for callers that can present a catch UI.
    }
  }

  function clearProgressError() {
    progressError.value = '';
  }

  function progressPercent(course: ICourse) {
    if (course.lessons.length === 0) {
      return 0;
    }
    const progress = progressFor(course.id);
    return Math.round((course.lessons.filter((lesson) => progress[lesson.id]?.completed).length / course.lessons.length) * 100);
  }

  return {
    recentCourses,
    openCourses,
    activeTab,
    currentCourse,
    currentLesson,
    loading,
    loadingMessage,
    error,
    progressError,
    load,
    openFolder,
    openRecentCourse,
    removeRecentCourse,
    selectLesson,
    closeCourse,
    setActiveTab,
    findResumeLesson,
    progressFor,
    lessonProgress,
    saveProgress,
    clearLessonProgress,
    clearCourseProgress,
    retryProgressWrites,
    toggleComplete,
    clearProgressError,
    progressPercent,
  };
}
