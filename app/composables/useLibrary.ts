import type {IFolder, ILessonProgress, IMediaLesson, IRecentFolder, TFolderProgress} from '../../shared/types';
import {useI18n} from 'vue-i18n';
import {messages} from '../../shared/i18n';

interface IProgressMutation {
  revision: number;
  progress: ILessonProgress | null;
}

interface IProgressMutationState {
  folderClearRevision: number;
  lessons: Map<string, IProgressMutation>;
  pendingRevisions: Set<number>;
}

interface IProgressReadSnapshot {
  revision: number;
  pendingRevisions: Set<number>;
}

type TProgressWriteKind = 'save' | 'clear-lesson' | 'clear-folder';

interface IProgressWrite {
  folderId: string;
  kind: TProgressWriteKind;
  lessonId?: string;
  previousFolderProgress?: TFolderProgress;
  previousProgress?: ILessonProgress;
  progress?: ILessonProgress;
  revision: number;
  status: 'failed' | 'queued';
}

export function useLibrary() {
  const {t, locale} = useI18n();
  const recentFolders = useState<IRecentFolder[]>('evb-player-recent', () => []);
  const openFolders = useState<IFolder[]>('evb-player-open', () => []);
  const activeTab = useState<string>('evb-player-active-tab', () => 'library');
  const playbackFolderId = useState<string | null>('evb-player-playback-folder', () => null);
  const progressByFolder = useState<Record<string, TFolderProgress>>('evb-player-progress', () => ({}));
  const selectedLessonByFolder = useState<Record<string, string>>('evb-player-selected-lesson', () => ({}));
  const loading = useState<boolean>('evb-player-loading', () => false);
  const loadingMessage = useState<string>('evb-player-loading-message', () => t('library.scanningFolder'));
  const error = useState<string>('evb-player-error', () => '');
  const progressError = useState<string>('evb-player-progress-error', () => '');
  let progressWriteQueue: Promise<void> = Promise.resolve();
  let operationGeneration = 0;
  const progressRevisionByFolder = new Map<string, number>();
  const progressMutationsByFolder = new Map<string, IProgressMutationState>();
  const progressWrites = new Map<string, IProgressWrite>();

  const currentFolder = computed(() => openFolders.value.find((folder) => folder.id === activeTab.value) ?? null);
  const playbackFolder = computed(() => openFolders.value.find((folder) => folder.id === playbackFolderId.value) ?? null);
  const currentLesson = computed(() => selectedLesson(currentFolder.value));
  const playbackLesson = computed(() => selectedLesson(playbackFolder.value));

  function selectedLesson(folder: IFolder | null) {
    if (!folder) {
      return null;
    }
    const selectedLessonId = selectedLessonByFolder.value[folder.id];
    return folder.lessons.find((lesson) => lesson.id === selectedLessonId) ?? folder.lessons[0] ?? null;
  }

  function getApi() {
    return import.meta.client ? window.evbPlayer : null;
  }

  function messageFor(cause: unknown, fallback: string) {
    const knownMainMessages = Object.values(messages[locale.value as keyof typeof messages].main);
    if (cause instanceof Error && knownMainMessages.some((message) => message === cause.message)) {
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

  function progressFor(folderId: string) {
    return progressByFolder.value[folderId] ?? {};
  }

  function findResumeLesson(folder: IFolder) {
    const progress = progressFor(folder.id);
    const inProgressLessons = folder.lessons
      .filter((lesson) => {
        const lessonState = progress[lesson.id];
        return Boolean(lessonState && !lessonState.completed && lessonState.position > 1);
      })
      .sort((left, right) => (progress[right.id]?.updatedAt ?? 0) - (progress[left.id]?.updatedAt ?? 0));
    return inProgressLessons[0] ?? folder.lessons.find((lesson) => !progress[lesson.id]?.completed) ?? folder.lessons[0] ?? null;
  }

  function mutationStateFor(folderId: string) {
    const existing = progressMutationsByFolder.get(folderId);
    if (existing) {
      return existing;
    }
    const state: IProgressMutationState = {
      folderClearRevision: 0,
      lessons: new Map(),
      pendingRevisions: new Set(),
    };
    progressMutationsByFolder.set(folderId, state);
    return state;
  }

  function nextProgressRevision(folderId: string) {
    const revision = (progressRevisionByFolder.get(folderId) ?? 0) + 1;
    progressRevisionByFolder.set(folderId, revision);
    mutationStateFor(folderId).pendingRevisions.add(revision);
    return revision;
  }

  function recordLessonMutation(folderId: string, lessonId: string, progress: ILessonProgress | null) {
    const revision = nextProgressRevision(folderId);
    mutationStateFor(folderId).lessons.set(lessonId, {revision, progress});
    return revision;
  }

  function recordFolderClear(folderId: string) {
    const revision = nextProgressRevision(folderId);
    mutationStateFor(folderId).folderClearRevision = revision;
    return revision;
  }

  function progressReadSnapshot(folderId: string): IProgressReadSnapshot {
    const state = progressMutationsByFolder.get(folderId);
    return {
      revision: progressRevisionByFolder.get(folderId) ?? 0,
      pendingRevisions: new Set(state?.pendingRevisions ?? []),
    };
  }

  function mergeProgressRead(folderId: string, loadedProgress: TFolderProgress, snapshot: IProgressReadSnapshot) {
    const state = progressMutationsByFolder.get(folderId);
    if (!state) {
      return loadedProgress;
    }

    const mergedProgress = {...loadedProgress};
    const folderWasLocallyCleared = state.folderClearRevision > 0;
    if (folderWasLocallyCleared) {
      for (const lessonId of Object.keys(mergedProgress)) {
        delete mergedProgress[lessonId];
      }
    }

    for (const [lessonId, mutation] of state.lessons) {
      if (folderWasLocallyCleared && mutation.revision <= state.folderClearRevision) {
        continue;
      }
      const mutationMustWin = mutation.revision > snapshot.revision
        || snapshot.pendingRevisions.has(mutation.revision)
        || (folderWasLocallyCleared && mutation.revision > state.folderClearRevision);
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
    return `${write.folderId}:${write.revision}:${write.kind}:${write.lessonId ?? ''}`;
  }

  function markProgressPersisted(write: IProgressWrite) {
    mutationStateFor(write.folderId).pendingRevisions.delete(write.revision);
    progressWrites.delete(progressWriteKey(write));
  }

  function hasFailedProgressWrites() {
    return [...progressWrites.values()].some((write) => write.status === 'failed');
  }

  function isCurrentProgressWrite(write: IProgressWrite) {
    const state = mutationStateFor(write.folderId);
    if (write.kind === 'clear-folder') {
      const rolledBackFailedClear = write.status === 'failed' && state.folderClearRevision === 0;
      return (state.folderClearRevision === write.revision || rolledBackFailedClear)
        && (progressRevisionByFolder.get(write.folderId) ?? 0) === write.revision;
    }
    return state.lessons.get(write.lessonId ?? '')?.revision === write.revision
      && state.folderClearRevision <= write.revision;
  }

  function rollbackFailedClear(write: IProgressWrite) {
    if (write.kind === 'save' || !isCurrentProgressWrite(write)) {
      return;
    }

    const nextProgress = {...progressByFolder.value};
    if (write.kind === 'clear-folder') {
      if (write.previousFolderProgress && Object.keys(write.previousFolderProgress).length > 0) {
        nextProgress[write.folderId] = {...write.previousFolderProgress};
      } else {
        delete nextProgress[write.folderId];
      }
    } else {
      const folderProgress = {...(nextProgress[write.folderId] ?? {})};
      if (write.previousProgress) {
        folderProgress[write.lessonId ?? ''] = write.previousProgress;
      } else {
        delete folderProgress[write.lessonId ?? ''];
      }
      if (Object.keys(folderProgress).length > 0) {
        nextProgress[write.folderId] = folderProgress;
      } else {
        delete nextProgress[write.folderId];
      }
    }
    progressByFolder.value = nextProgress;
    const state = mutationStateFor(write.folderId);
    state.pendingRevisions.delete(write.revision);
    if (write.kind === 'clear-folder') {
      state.folderClearRevision = 0;
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
          await api.saveLessonProgress({folderId: write.folderId, lessonId: write.lessonId ?? '', progress: write.progress});
        } else if (write.kind === 'clear-lesson') {
          await api.clearLessonProgress(write.folderId, write.lessonId ?? '');
        } else {
          await api.clearFolderProgress(write.folderId);
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
    const state = mutationStateFor(write.folderId);
    state.pendingRevisions.delete(write.revision);
    if (write.kind === 'clear-folder' && state.folderClearRevision === write.revision) {
      state.folderClearRevision = 0;
    }
    progressWrites.delete(progressWriteKey(write));
  }

  async function loadFolderProgress(folder: IFolder, generation: number) {
    const api = getApi();
    if (!api) {
      return true;
    }
    const snapshot = progressReadSnapshot(folder.id);
    const loadedProgress = await api.getFolderProgress(folder.id);
    if (!isCurrentOperation(generation)) {
      return false;
    }
    const nextProgress = mergeProgressRead(folder.id, loadedProgress ?? {}, snapshot);
    progressByFolder.value = {
      ...progressByFolder.value,
      [folder.id]: nextProgress,
    };
    return true;
  }

  async function openFolderTab(folder: IFolder, generation: number) {
    if (!await loadFolderProgress(folder, generation) || !isCurrentOperation(generation)) {
      return false;
    }

    const existingFolder = openFolders.value.find((tab) => tab.id === folder.id);
    openFolders.value = existingFolder
      ? openFolders.value.map((tab) => tab.id === folder.id ? folder : tab)
      : [...openFolders.value, folder];

    const selectedLessonId = selectedLessonByFolder.value[folder.id];
    if (!folder.lessons.some((lesson) => lesson.id === selectedLessonId)) {
      selectedLessonByFolder.value = {
        ...selectedLessonByFolder.value,
        [folder.id]: findResumeLesson(folder)?.id ?? '',
      };
    }
    activeTab.value = folder.id;
    playbackFolderId.value = folder.id;
    return true;
  }

  async function load() {
    const api = getApi();
    if (!api) {
      return;
    }
    const generation = beginOperation(t('library.loadingLibrary'));
    try {
      const loadedRecentFolders = await api.getRecentFolders();
      if (!isCurrentOperation(generation)) {
        return;
      }
      recentFolders.value = loadedRecentFolders;

      const restoredFolder = await api.restoreLastFolder();
      if (!restoredFolder || !isCurrentOperation(generation)) {
        return;
      }
      if (await openFolderTab(restoredFolder, generation) && isCurrentOperation(generation)) {
        const refreshedRecentFolders = await api.getRecentFolders();
        if (isCurrentOperation(generation)) {
          recentFolders.value = refreshedRecentFolders;
        }
      }
    } catch (cause) {
      if (isCurrentOperation(generation)) {
        error.value = messageFor(cause, t('library.loadFailed'));
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
    const generation = beginOperation(t('library.scanningFolder'));
    try {
      const folder = await api.chooseFolder();
      if (!folder || !isCurrentOperation(generation)) {
        return;
      }
      const refreshedRecentFolders = await api.getRecentFolders();
      if (!isCurrentOperation(generation)) {
        return;
      }
      recentFolders.value = refreshedRecentFolders;
      if (isCurrentOperation(generation)) {
        await openFolderTab(folder, generation);
      }
    } catch (cause) {
      if (isCurrentOperation(generation)) {
        error.value = messageFor(cause, t('library.chooseFailed'));
      }
    } finally {
      endOperation(generation);
    }
  }

  async function openRecentFolder(recentFolder: IRecentFolder) {
    const api = getApi();
    if (!api) {
      return;
    }
    const generation = beginOperation(t('library.openingFolder'));
    try {
      const folder = await api.openRecentFolder(recentFolder.rootPath);
      if (!folder || !isCurrentOperation(generation)) {
        return;
      }
      const refreshedRecentFolders = await api.getRecentFolders();
      if (!isCurrentOperation(generation)) {
        return;
      }
      recentFolders.value = refreshedRecentFolders;
      if (isCurrentOperation(generation)) {
        await openFolderTab(folder, generation);
      }
    } catch (cause) {
      if (isCurrentOperation(generation)) {
        error.value = messageFor(cause, t('library.recentFailed'));
      }
    } finally {
      endOperation(generation);
    }
  }

  async function removeRecentFolder(recentFolder: IRecentFolder) {
    const api = getApi();
    if (!api) {
      return;
    }
    const generation = beginOperation(t('library.removingFolder'));
    try {
      await api.removeRecentFolder(recentFolder.rootPath);
      if (!isCurrentOperation(generation)) {
        return;
      }
      recentFolders.value = recentFolders.value.filter((candidate) => candidate.id !== recentFolder.id);
      closeFolderState(recentFolder.id);
      try {
        const refreshedRecentFolders = await api.getRecentFolders();
        if (isCurrentOperation(generation)) {
          recentFolders.value = refreshedRecentFolders;
        }
      } catch (cause) {
        if (isCurrentOperation(generation)) {
          error.value = messageFor(cause, t('library.refreshFailed'));
        }
      }
    } catch (cause) {
      if (isCurrentOperation(generation)) {
        error.value = messageFor(cause, t('library.removeFailed'));
      }
    } finally {
      endOperation(generation);
    }
  }

  function selectLesson(lesson: IMediaLesson) {
    const folder = playbackFolder.value;
    if (!folder || !folder.lessons.some((candidate) => candidate.id === lesson.id)) {
      return;
    }
    invalidatePendingOperations();
    selectedLessonByFolder.value = {
      ...selectedLessonByFolder.value,
      [folder.id]: lesson.id,
    };
  }

  function closeFolderState(folderId: string) {
    const folderIndex = openFolders.value.findIndex((folder) => folder.id === folderId);
    if (folderIndex === -1) {
      if (activeTab.value !== 'library' && !openFolders.value.some((folder) => folder.id === activeTab.value)) {
        activeTab.value = 'library';
      }
      return;
    }

    openFolders.value = openFolders.value.filter((folder) => folder.id !== folderId);
    if (activeTab.value === folderId) {
      const nextFolder = openFolders.value[folderIndex] ?? openFolders.value[folderIndex - 1];
      activeTab.value = nextFolder?.id ?? 'library';
    } else if (activeTab.value !== 'library' && !openFolders.value.some((folder) => folder.id === activeTab.value)) {
      activeTab.value = 'library';
    }
    if (playbackFolderId.value === folderId) {
      playbackFolderId.value = activeTab.value === 'library' ? null : activeTab.value;
    }
  }

  function closeFolder(folderId: string) {
    invalidatePendingOperations();
    closeFolderState(folderId);
  }

  function setActiveTab(tabId: string) {
    invalidatePendingOperations();
    activeTab.value = tabId === 'library' || openFolders.value.some((folder) => folder.id === tabId) ? tabId : 'library';
    // Library is navigation only. Keep the same media owner until another folder is selected or closed.
    if (activeTab.value !== 'library') {
      playbackFolderId.value = activeTab.value;
    }
  }

  function lessonProgress(folderId: string, lessonId: string): ILessonProgress | null {
    return progressByFolder.value[folderId]?.[lessonId] ?? null;
  }

  async function saveProgress(folderId: string, lessonId: string, progress: ILessonProgress) {
    const revision = recordLessonMutation(folderId, lessonId, progress);
    progressByFolder.value = {
      ...progressByFolder.value,
      [folderId]: {
        ...(progressByFolder.value[folderId] ?? {}),
        [lessonId]: progress,
      },
    };
    const api = getApi();
    if (!api) {
      mutationStateFor(folderId).pendingRevisions.delete(revision);
      return;
    }
    const write: IProgressWrite = {folderId, kind: 'save', lessonId, progress, revision, status: 'queued'};
    progressWrites.set(progressWriteKey(write), write);
    await persistProgressWrite(write, t('library.progressWriteFailed'));
  }

  async function clearLessonProgress(folderId: string, lessonId: string) {
    const previousProgress = progressByFolder.value[folderId]?.[lessonId];
    const revision = recordLessonMutation(folderId, lessonId, null);
    const folderProgress = {...(progressByFolder.value[folderId] ?? {})};
    delete folderProgress[lessonId];
    const nextProgress = {...progressByFolder.value};
    if (Object.keys(folderProgress).length === 0) {
      delete nextProgress[folderId];
    } else {
      nextProgress[folderId] = folderProgress;
    }
    progressByFolder.value = nextProgress;
    const api = getApi();
    if (!api) {
      mutationStateFor(folderId).pendingRevisions.delete(revision);
      return;
    }
    const write: IProgressWrite = {
      folderId,
      kind: 'clear-lesson',
      lessonId,
      previousProgress: previousProgress ? {...previousProgress} : undefined,
      revision,
      status: 'queued',
    };
    progressWrites.set(progressWriteKey(write), write);
    await persistProgressWrite(write, t('library.progressClearFailed'));
  }

  async function clearFolderProgress(folderId: string) {
    const previousFolderProgress = progressByFolder.value[folderId]
      ? {...progressByFolder.value[folderId]}
      : undefined;
    const revision = recordFolderClear(folderId);
    const nextProgress = {...progressByFolder.value};
    delete nextProgress[folderId];
    progressByFolder.value = nextProgress;
    const api = getApi();
    if (!api) {
      mutationStateFor(folderId).pendingRevisions.delete(revision);
      return;
    }
    const write: IProgressWrite = {
      folderId,
      kind: 'clear-folder',
      previousFolderProgress,
      revision,
      status: 'queued',
    };
    progressWrites.set(progressWriteKey(write), write);
    await persistProgressWrite(write, t('library.progressClearFailed'));
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
          await saveProgress(failedWrite.folderId, failedWrite.lessonId, failedWrite.progress);
        } else if (failedWrite.kind === 'clear-lesson' && failedWrite.lessonId) {
          await clearLessonProgress(failedWrite.folderId, failedWrite.lessonId);
        } else if (failedWrite.kind === 'clear-folder') {
          await clearFolderProgress(failedWrite.folderId);
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
    const folder = playbackFolder.value;
    if (!folder || !folder.lessons.some((candidate) => candidate.id === lesson.id)) {
      return;
    }
    const previous = lessonProgress(folder.id, lesson.id);
    try {
      await saveProgress(folder.id, lesson.id, {
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

  function progressPercent(folder: IFolder) {
    if (folder.lessons.length === 0) {
      return 0;
    }
    const progress = progressFor(folder.id);
    return Math.round((folder.lessons.filter((lesson) => progress[lesson.id]?.completed).length / folder.lessons.length) * 100);
  }

  return {
    recentFolders,
    openFolders,
    activeTab,
    currentFolder,
    currentLesson,
    playbackFolder,
    playbackLesson,
    loading,
    loadingMessage,
    error,
    progressError,
    load,
    openFolder,
    openRecentFolder,
    removeRecentFolder,
    selectLesson,
    closeFolder,
    setActiveTab,
    findResumeLesson,
    progressFor,
    lessonProgress,
    saveProgress,
    clearLessonProgress,
    clearFolderProgress,
    retryProgressWrites,
    toggleComplete,
    clearProgressError,
    progressPercent,
  };
}
