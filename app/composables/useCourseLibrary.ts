import type {ICourse, ILessonProgress, IMediaLesson, IRecentCourse, TCourseProgress} from '../../shared/types';

export function useCourseLibrary() {
  const recentCourses = useState<IRecentCourse[]>('course-shelf-recent', () => []);
  const openCourses = useState<ICourse[]>('course-shelf-open', () => []);
  const activeTab = useState<string>('course-shelf-active-tab', () => 'library');
  const progressByCourse = useState<Record<string, TCourseProgress>>('course-shelf-progress', () => ({}));
  const selectedLessonByCourse = useState<Record<string, string>>('course-shelf-selected-lesson', () => ({}));
  const loading = useState<boolean>('course-shelf-loading', () => false);
  const error = useState<string>('course-shelf-error', () => '');
  let progressWriteQueue: Promise<void> = Promise.resolve();

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

  async function loadCourseProgress(course: ICourse) {
    const api = getApi();
    if (!api) {
      return;
    }
    progressByCourse.value = {
      ...progressByCourse.value,
      [course.id]: await api.getCourseProgress(course.id),
    };
  }

  async function openCourse(course: ICourse) {
    const existingCourse = openCourses.value.find((openCourse) => openCourse.id === course.id);
    openCourses.value = existingCourse
      ? openCourses.value.map((openCourse) => openCourse.id === course.id ? course : openCourse)
      : [...openCourses.value, course];
    await loadCourseProgress(course);
    selectedLessonByCourse.value = {
      ...selectedLessonByCourse.value,
      [course.id]: findResumeLesson(course)?.id ?? '',
    };
    activeTab.value = course.id;
  }

  async function load() {
    const api = getApi();
    if (!api || loading.value) {
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      recentCourses.value = await api.getRecentCourses();
      const restoredCourse = await api.restoreLastCourse();
      if (restoredCourse) {
        await openCourse(restoredCourse);
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'The course library could not be loaded.';
    } finally {
      loading.value = false;
    }
  }

  async function openFolder() {
    const api = getApi();
    if (!api) {
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const course = await api.chooseFolder();
      if (course) {
        recentCourses.value = await api.getRecentCourses();
        await openCourse(course);
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'The selected folder could not be opened.';
    } finally {
      loading.value = false;
    }
  }

  async function openRecentCourse(recentCourse: IRecentCourse) {
    const api = getApi();
    if (!api) {
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const course = await api.openRecentCourse(recentCourse.rootPath);
      if (course) {
        recentCourses.value = await api.getRecentCourses();
        await openCourse(course);
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'The recent folder could not be opened.';
    } finally {
      loading.value = false;
    }
  }

  async function removeRecentCourse(recentCourse: IRecentCourse) {
    const api = getApi();
    if (!api) {
      return;
    }
    error.value = '';
    try {
      await api.removeRecentCourse(recentCourse.rootPath);
      recentCourses.value = recentCourses.value.filter((candidate) => candidate.id !== recentCourse.id);
      closeCourse(recentCourse.id);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'The course could not be removed from the collection.';
    }
  }

  function selectLesson(lesson: IMediaLesson) {
    if (!currentCourse.value) {
      return;
    }
    selectedLessonByCourse.value = {
      ...selectedLessonByCourse.value,
      [currentCourse.value.id]: lesson.id,
    };
  }

  function closeCourse(courseId: string) {
    const courseIndex = openCourses.value.findIndex((course) => course.id === courseId);
    openCourses.value = openCourses.value.filter((course) => course.id !== courseId);
    if (activeTab.value !== courseId) {
      return;
    }
    const nextCourse = openCourses.value[courseIndex] ?? openCourses.value[courseIndex - 1];
    activeTab.value = nextCourse?.id ?? 'library';
  }

  function setActiveTab(tabId: string) {
    activeTab.value = tabId;
  }

  function lessonProgress(courseId: string, lessonId: string): ILessonProgress | null {
    return progressByCourse.value[courseId]?.[lessonId] ?? null;
  }

  async function saveProgress(courseId: string, lessonId: string, progress: ILessonProgress) {
    const api = getApi();
    progressByCourse.value = {
      ...progressByCourse.value,
      [courseId]: {
        ...(progressByCourse.value[courseId] ?? {}),
        [lessonId]: progress,
      },
    };
    if (api) {
      await enqueueProgressWrite(() => api.saveLessonProgress({courseId, lessonId, progress}));
    }
  }

  async function clearLessonProgress(courseId: string, lessonId: string) {
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
    if (api) {
      await enqueueProgressWrite(() => api.clearLessonProgress(courseId, lessonId));
    }
  }

  async function clearCourseProgress(courseId: string) {
    const nextProgress = {...progressByCourse.value};
    delete nextProgress[courseId];
    progressByCourse.value = nextProgress;
    const api = getApi();
    if (api) {
      await enqueueProgressWrite(() => api.clearCourseProgress(courseId));
    }
  }

  async function toggleComplete(lesson: IMediaLesson) {
    const course = currentCourse.value;
    if (!course) {
      return;
    }
    const previous = lessonProgress(course.id, lesson.id);
    await saveProgress(course.id, lesson.id, {
      position: previous?.position ?? 0,
      duration: previous?.duration || lesson.duration || 0,
      completed: !previous?.completed,
      updatedAt: Date.now(),
    });
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
    error,
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
    toggleComplete,
    progressPercent,
  };
}
