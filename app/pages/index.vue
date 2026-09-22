<script setup lang="ts">
import {useDebounceFn} from '@vueuse/core';
import {nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
import type {ICourse, IMediaLesson} from '../../shared/types';
import {useCourseLibrary} from '../composables/useCourseLibrary';

type ProgressResetRequest = {
  scope: 'lesson' | 'course';
  courseId: string;
  lessonId?: string;
  lessonTitle?: string;
};

const library = useCourseLibrary();
const toast = useToast();
const recentCourses = library.recentCourses;
const openCourses = library.openCourses;
const activeTab = library.activeTab;
const loading = library.loading;
const error = library.error;
const search = ref('');
const mediaRef = ref<HTMLVideoElement | HTMLAudioElement | null>(null);
const playerStageRef = ref<HTMLElement | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const loadedDuration = ref(0);
const volume = ref(1);
const lastVolume = ref(1);
const playbackRate = ref(1);
const isFullscreen = ref(false);
const isTheaterMode = ref(false);
const areControlsVisible = ref(true);
const isPlayerFocused = ref(false);
const autoplayLessonId = ref<string | null>(null);
const progressResetRequest = ref<ProgressResetRequest | null>(null);
const isProgressResetDialogOpen = ref(false);
const isResettingProgress = ref(false);
let controlsHideTimer: ReturnType<typeof setTimeout> | null = null;
let removeWindowFullscreenListener: (() => void) | null = null;
let isPointerInteraction = false;
let lessonLoadRequest = 0;
let progressPersistenceGeneration = 0;
let isProgressPersistenceSuspended = false;

const currentCourse = library.currentCourse;
const currentLesson = library.currentLesson;

const filteredLessons = computed(() => {
  const course = currentCourse.value;
  const query = search.value.trim().toLocaleLowerCase();
  if (!course) {
    return [];
  }
  if (!query) {
    return course.lessons;
  }
  return course.lessons.filter((lesson) => `${lesson.title} ${lesson.fileName} ${lesson.relativePath}`.toLocaleLowerCase().includes(query));
});

const lessonGroups = computed(() => {
  const groups = new Map<string, IMediaLesson[]>();
  for (const lesson of filteredLessons.value) {
    const group = groups.get(lesson.section) ?? [];
    group.push(lesson);
    groups.set(lesson.section, group);
  }
  return [...groups.entries()].map(([section, lessons]) => ({section, lessons}));
});

const watchedCount = computed(() => {
  const course = currentCourse.value;
  if (!course) {
    return 0;
  }
  const progress = library.progressFor(course.id);
  return course.lessons.filter((lesson) => progress[lesson.id]?.completed).length;
});

const courseProgress = computed(() => currentCourse.value ? library.progressPercent(currentCourse.value) : 0);
const mediaDuration = computed(() => loadedDuration.value || currentLesson.value?.duration || 0);
const volumeIcon = computed(() => volume.value === 0 ? 'i-lucide-volume-x' : volume.value < 0.5 ? 'i-lucide-volume-1' : 'i-lucide-volume-2');
const currentProgress = computed(() => {
  const course = currentCourse.value;
  const lesson = currentLesson.value;
  return course && lesson ? library.lessonProgress(course.id, lesson.id) : null;
});

const persistCurrentPosition = useDebounceFn((generation: number) => {
  if (generation !== progressPersistenceGeneration || isProgressPersistenceSuspended) {
    return;
  }
  void saveCurrentProgress();
}, 900);

const visibleCourseTabs = computed(() => openCourses.value);
const currentLessonIndex = computed(() => {
  const course = currentCourse.value;
  const lesson = currentLesson.value;
  return course && lesson ? course.lessons.findIndex((candidate) => candidate.id === lesson.id) : -1;
});
const hasPreviousLesson = computed(() => currentLessonIndex.value > 0);
const hasNextLesson = computed(() => {
  const course = currentCourse.value;
  return Boolean(course && currentLessonIndex.value >= 0 && currentLessonIndex.value < course.lessons.length - 1);
});
const progressResetTitle = computed(() => progressResetRequest.value?.scope === 'course' ? 'Reset course progress?' : 'Reset track progress?');
const progressResetDescription = computed(() => {
  const request = progressResetRequest.value;
  if (!request) {
    return '';
  }
  if (request.scope === 'course') {
    return 'This clears saved positions and completion state for every track in this course.';
  }
  return `This clears the saved position and completion state for “${request.lessonTitle}”.`;
});

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) {
    return '—';
  }
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatCourseDuration(seconds: number) {
  if (!seconds) {
    return 'Duration appears as lessons are opened';
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  }
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function progressForLesson(lesson: IMediaLesson) {
  const course = currentCourse.value;
  if (!course) {
    return 0;
  }
  const progress = library.lessonProgress(course.id, lesson.id);
  const duration = progress?.duration || lesson.duration || 0;
  if (progress?.completed) {
    return 100;
  }
  return duration > 0 ? Math.min(100, Math.round((progress?.position ?? 0) / duration * 100)) : 0;
}

function isLessonComplete(lesson: IMediaLesson) {
  const course = currentCourse.value;
  return Boolean(course && library.lessonProgress(course.id, lesson.id)?.completed);
}

function requestLessonProgressReset() {
  const course = currentCourse.value;
  const lesson = currentLesson.value;
  if (!course || !lesson) {
    return;
  }
  progressResetRequest.value = {
    scope: 'lesson',
    courseId: course.id,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
  };
  isProgressResetDialogOpen.value = true;
}

function requestCourseProgressReset() {
  const course = currentCourse.value;
  if (!course) {
    return;
  }
  progressResetRequest.value = {
    scope: 'course',
    courseId: course.id,
  };
  isProgressResetDialogOpen.value = true;
}

function cancelProgressReset() {
  if (isResettingProgress.value) {
    return;
  }
  isProgressResetDialogOpen.value = false;
  progressResetRequest.value = null;
}

function resetCurrentMedia() {
  const media = mediaRef.value;
  if (!media) {
    return;
  }
  media.currentTime = 0;
  media.pause();
  currentTime.value = 0;
  showPlayerControls();
}

async function confirmProgressReset() {
  const request = progressResetRequest.value;
  if (!request) {
    return;
  }
  isResettingProgress.value = true;
  const isCurrentCourse = currentCourse.value?.id === request.courseId;
  const resetsCurrentLesson = request.scope === 'course' || request.lessonId === currentLesson.value?.id;
  if (resetsCurrentLesson && isCurrentCourse) {
    progressPersistenceGeneration += 1;
    isProgressPersistenceSuspended = true;
  }
  try {
    if (request.scope === 'course') {
      if (isCurrentCourse) {
        resetCurrentMedia();
      }
      await library.clearCourseProgress(request.courseId);
      toast.add({
        title: 'Course progress reset',
        description: 'All saved positions and completion states were cleared.',
        color: 'success',
        icon: 'i-lucide-rotate-ccw',
      });
    } else if (request.lessonId) {
      if (isCurrentCourse && request.lessonId === currentLesson.value?.id) {
        resetCurrentMedia();
      }
      await library.clearLessonProgress(request.courseId, request.lessonId);
      toast.add({
        title: 'Track progress reset',
        description: `“${request.lessonTitle}” will start from the beginning next time.`,
        color: 'success',
        icon: 'i-lucide-rotate-ccw',
      });
    }
    isProgressResetDialogOpen.value = false;
    progressResetRequest.value = null;
  } catch {
    toast.add({
      title: 'Could not reset progress',
      description: 'The progress file could not be updated.',
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    isResettingProgress.value = false;
  }
}

function playMedia(media: HTMLMediaElement) {
  void media.play().catch(() => {
    if (mediaRef.value === media) {
      isPlaying.value = false;
      showPlayerControls();
    }
  });
}

function selectLesson(lesson: IMediaLesson, autoplay = true) {
  const isCurrentLesson = currentLesson.value?.id === lesson.id;
  autoplayLessonId.value = autoplay ? lesson.id : null;
  library.selectLesson(lesson);
  search.value = '';
  if (autoplay) {
    isPlayerFocused.value = false;
  }
  if (isCurrentLesson) {
    autoplayLessonId.value = null;
    if (autoplay && mediaRef.value) {
      playMedia(mediaRef.value);
    }
  }
}

function resumeCurrentCourse() {
  const course = currentCourse.value;
  if (!course) {
    return;
  }
  const lesson = library.findResumeLesson(course);
  if (lesson) {
    selectLesson(lesson);
  }
}

function navigateLesson(direction: 1 | -1) {
  const course = currentCourse.value;
  const lesson = currentLesson.value;
  if (!course || !lesson) {
    return;
  }
  const index = course.lessons.findIndex((candidate) => candidate.id === lesson.id);
  const nextLesson = course.lessons[index + direction];
  if (nextLesson) {
    selectLesson(nextLesson);
  }
}

function togglePlayback() {
  const media = mediaRef.value;
  if (!media) {
    return;
  }
  showPlayerControls();
  if (media.paused) {
    isPlayerFocused.value = false;
    playMedia(media);
  } else {
    media.pause();
  }
}

function seekTo(position: number) {
  const media = mediaRef.value;
  if (!media || !Number.isFinite(media.duration) || media.duration <= 0) {
    return;
  }
  isProgressPersistenceSuspended = false;
  media.currentTime = Math.max(0, Math.min(media.duration, position));
  currentTime.value = media.currentTime;
  void saveCurrentProgress();
}

function skip(seconds: number) {
  const media = mediaRef.value;
  if (!media) {
    return;
  }
  seekTo(media.currentTime + seconds);
}

function setSeek(event: Event) {
  const media = mediaRef.value;
  const input = event.target as HTMLInputElement;
  if (!media) {
    return;
  }
  isProgressPersistenceSuspended = false;
  media.currentTime = Number(input.value);
  currentTime.value = media.currentTime;
  void saveCurrentProgress();
}

function setVolume(event: Event) {
  const input = event.target as HTMLInputElement;
  setVolumeValue(Number(input.value));
}

function setVolumeValue(nextVolume: number) {
  const normalizedVolume = Math.max(0, Math.min(1, nextVolume));
  volume.value = normalizedVolume;
  if (normalizedVolume > 0) {
    lastVolume.value = normalizedVolume;
  }
  if (mediaRef.value) {
    mediaRef.value.volume = normalizedVolume;
    mediaRef.value.muted = normalizedVolume === 0;
  }
}

function adjustVolume(delta: number) {
  setVolumeValue(volume.value + delta);
}

function toggleMute() {
  const media = mediaRef.value;
  if (!media) {
    return;
  }
  if (media.muted || media.volume === 0) {
    setVolumeValue(lastVolume.value || 1);
    return;
  }
  lastVolume.value = media.volume;
  volume.value = 0;
  media.muted = true;
}

function adjustPlaybackRate(delta: number) {
  const rates = [0.75, 1, 1.25, 1.5, 2];
  const currentIndex = rates.findIndex((rate) => rate === playbackRate.value);
  const nextIndex = Math.max(0, Math.min(rates.length - 1, (currentIndex === -1 ? 1 : currentIndex) + delta));
  setPlaybackRateValue(rates[nextIndex] ?? playbackRate.value);
}

function setPlaybackRateValue(rate: number) {
  playbackRate.value = rate;
  if (mediaRef.value) {
    mediaRef.value.playbackRate = rate;
  }
}

function frameStep(direction: 1 | -1) {
  const media = mediaRef.value;
  if (!media || !media.paused) {
    return;
  }
  skip(direction / 30);
}

function setPlaybackRate(event: Event) {
  const input = event.target as HTMLSelectElement;
  setPlaybackRateValue(Number(input.value));
}

function clearControlsHideTimer() {
  if (controlsHideTimer !== null) {
    clearTimeout(controlsHideTimer);
    controlsHideTimer = null;
  }
}

function scheduleControlsHide() {
  clearControlsHideTimer();
  if (!isPlaying.value || isPlayerFocused.value) {
    return;
  }
  controlsHideTimer = setTimeout(() => {
    controlsHideTimer = null;
    if (isPlaying.value && !isPlayerFocused.value) {
      areControlsVisible.value = false;
    }
  }, 2200);
}

function showPlayerControls() {
  areControlsVisible.value = true;
  scheduleControlsHide();
}

function handlePlayerPointerEnter() {
  showPlayerControls();
}

function handlePlayerPointerMove() {
  showPlayerControls();
}

function handlePlayerPointerLeave() {
  isPointerInteraction = false;
  scheduleControlsHide();
}

function handlePlayerPointerDown() {
  isPointerInteraction = true;
  isPlayerFocused.value = false;
  showPlayerControls();
}

function handlePlayerPointerUp() {
  isPointerInteraction = false;
  scheduleControlsHide();
}

function handlePlayerFocusIn() {
  const wasPointerInteraction = isPointerInteraction;
  isPointerInteraction = false;
  isPlayerFocused.value = !wasPointerInteraction && document.activeElement !== playerStageRef.value;
  showPlayerControls();
}

function handlePlayerFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && playerStageRef.value?.contains(nextTarget)) {
    return;
  }
  isPlayerFocused.value = false;
  scheduleControlsHide();
}

function toggleTheaterMode() {
  isTheaterMode.value = !isTheaterMode.value;
  showPlayerControls();
}

async function toggleFullscreen() {
  if (currentLesson.value?.kind !== 'video') {
    return;
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  const api = import.meta.client ? window.courseShelf : null;
  if (api) {
    isFullscreen.value = await api.setWindowFullscreen(!isFullscreen.value);
    return;
  }

  if (playerStageRef.value) {
    await playerStageRef.value.requestFullscreen();
  }
}

async function saveCurrentProgress(completed = false) {
  if (isProgressPersistenceSuspended) {
    return;
  }
  const course = currentCourse.value;
  const lesson = currentLesson.value;
  const media = mediaRef.value;
  if (!course || !lesson) {
    return;
  }
  const position = media?.currentTime ?? currentTime.value;
  const duration = media?.duration && Number.isFinite(media.duration) ? media.duration : loadedDuration.value || lesson.duration || 0;
  const previous = currentProgress.value;
  await library.saveProgress(course.id, lesson.id, {
    position: Number.isFinite(position) ? position : 0,
    duration,
    completed: completed || Boolean(previous?.completed),
    updatedAt: Date.now(),
  });
}

function isCurrentMediaEvent(event: Event) {
  return event.currentTarget === mediaRef.value;
}

function handleLoadedMetadata(event: Event) {
  if (!isCurrentMediaEvent(event)) {
    return;
  }
  const media = mediaRef.value;
  if (!media) {
    return;
  }
  loadedDuration.value = Number.isFinite(media.duration) ? media.duration : 0;
  media.volume = volume.value;
  media.muted = volume.value === 0;
  media.playbackRate = playbackRate.value;
  const savedPosition = currentProgress.value?.position ?? 0;
  if (savedPosition > 1 && savedPosition < media.duration - 2) {
    media.currentTime = savedPosition;
    currentTime.value = savedPosition;
  }
  if (!isResettingProgress.value) {
    void saveCurrentProgress();
  }
}

function handleTimeUpdate(event: Event) {
  if (!isCurrentMediaEvent(event)) {
    return;
  }
  const media = mediaRef.value;
  if (!media) {
    return;
  }
  currentTime.value = media.currentTime;
  if (!isResettingProgress.value) {
    persistCurrentPosition(progressPersistenceGeneration);
  }
}

function handlePlay(event: Event) {
  if (!isCurrentMediaEvent(event)) {
    return;
  }
  isProgressPersistenceSuspended = false;
  isPlaying.value = true;
  showPlayerControls();
}

function handlePause(event: Event) {
  if (!isCurrentMediaEvent(event)) {
    return;
  }
  isPlaying.value = false;
  showPlayerControls();
  if (isResettingProgress.value) {
    return;
  }
  void saveCurrentProgress();
}

async function handleEnded(event: Event) {
  if (!isCurrentMediaEvent(event)) {
    return;
  }
  const course = currentCourse.value;
  const lesson = currentLesson.value;
  const lessonIndex = course && lesson ? course.lessons.findIndex((candidate) => candidate.id === lesson.id) : -1;
  const nextLesson = course && lessonIndex >= 0 ? course.lessons[lessonIndex + 1] : null;
  isPlaying.value = false;
  showPlayerControls();
  await saveCurrentProgress(true);
  if (nextLesson && currentLesson.value?.id === lesson?.id) {
    selectLesson(nextLesson);
  }
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

function syncFullscreenDocumentClass(fullscreen: boolean) {
  if (!import.meta.client) {
    return;
  }
  document.documentElement.classList.toggle('course-shelf-fullscreen', fullscreen);
  document.body.classList.toggle('course-shelf-fullscreen', fullscreen);
}

function handleKeyboard(event: KeyboardEvent) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  const target = event.target;
  const isRangeControl = target instanceof HTMLInputElement && target.type === 'range';
  if ((target instanceof HTMLInputElement && !isRangeControl) || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) {
    return;
  }
  if (target instanceof HTMLButtonElement && (event.code === 'Space' || event.key === 'Enter')) {
    return;
  }

  const key = event.key.toLowerCase();
  const code = event.code.toLowerCase();
  const isSpace = key === ' ' || code === 'space';
  const isKey = (letter: string) => key === letter || code === `key${letter}`;
  const isArrowLeft = key === 'arrowleft' || key === 'left' || code === 'arrowleft' || code === 'left';
  const isArrowRight = key === 'arrowright' || key === 'right' || code === 'arrowright' || code === 'right';
  const isArrowUp = key === 'arrowup' || key === 'up' || code === 'arrowup' || code === 'up';
  const isArrowDown = key === 'arrowdown' || key === 'down' || code === 'arrowdown' || code === 'down';
  const isHome = key === 'home' || code === 'home';
  const isEnd = key === 'end' || code === 'end';
  const isComma = key === ',' || code === 'comma';
  const isPeriod = key === '.' || code === 'period';
  const isLessThan = key === '<' || (isComma && event.shiftKey);
  const isGreaterThan = key === '>' || (isPeriod && event.shiftKey);
  const isEscape = key === 'escape' || code === 'escape';
  const digitMatch = /^digit([0-9])$/u.exec(code);
  const digit = !event.shiftKey ? digitMatch?.[1] ?? (/^[0-9]$/u.test(key) ? key : null) : null;
  let handled = true;
  if (isSpace || isKey('k')) {
    togglePlayback();
  } else if (isKey('j')) {
    skip(-10);
  } else if (isKey('l')) {
    skip(10);
  } else if (isArrowLeft) {
    skip(-5);
  } else if (isArrowRight) {
    skip(5);
  } else if (isArrowUp) {
    adjustVolume(0.05);
  } else if (isArrowDown) {
    adjustVolume(-0.05);
  } else if (isKey('m')) {
    toggleMute();
  } else if (isKey('f')) {
    void toggleFullscreen();
  } else if (isHome) {
    seekTo(0);
  } else if (isEnd) {
    const media = mediaRef.value;
    if (media?.duration) {
      seekTo(media.duration);
    }
  } else if (digit !== null) {
    const media = mediaRef.value;
    if (media?.duration) {
      seekTo(media.duration * Number(digit) / 10);
    }
  } else if (isKey('n') && event.shiftKey) {
    navigateLesson(1);
  } else if (isKey('p') && event.shiftKey) {
    navigateLesson(-1);
  } else if (isKey('t')) {
    toggleTheaterMode();
  } else if (isGreaterThan) {
    adjustPlaybackRate(1);
  } else if (isLessThan) {
    adjustPlaybackRate(-1);
  } else if (isComma && !event.shiftKey) {
    frameStep(-1);
  } else if (isPeriod && !event.shiftKey) {
    frameStep(1);
  } else if (isEscape && isFullscreen.value) {
    void toggleFullscreen();
  } else {
    handled = false;
  }

  if (handled) {
    event.preventDefault();
    showPlayerControls();
  }
}

watch(() => currentLesson.value?.id, async (lessonId) => {
  const requestId = ++lessonLoadRequest;
  isProgressPersistenceSuspended = false;
  currentTime.value = 0;
  loadedDuration.value = currentLesson.value?.duration ?? 0;
  isPlaying.value = false;
  showPlayerControls();
  await nextTick();
  if (requestId !== lessonLoadRequest || currentLesson.value?.id !== lessonId) {
    return;
  }
  const media = mediaRef.value;
  if (!media) {
    return;
  }
  const shouldAutoplay = autoplayLessonId.value === lessonId;
  autoplayLessonId.value = null;
  media.load();
  if (shouldAutoplay) {
    isPlayerFocused.value = false;
    playMedia(media);
  }
});

watch(isFullscreen, syncFullscreenDocumentClass);

onMounted(async () => {
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('keydown', handleKeyboard);
  if (import.meta.client && window.courseShelf) {
    removeWindowFullscreenListener = window.courseShelf.onWindowFullscreenChanged((fullscreen) => {
      isFullscreen.value = fullscreen;
    });
  }
  syncFullscreenDocumentClass(isFullscreen.value);
  await library.load();
});

onUnmounted(() => {
  clearControlsHideTimer();
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  document.removeEventListener('keydown', handleKeyboard);
  removeWindowFullscreenListener?.();
  removeWindowFullscreenListener = null;
  syncFullscreenDocumentClass(false);
});
</script>

<template>
  <div class="course-shell">
    <header class="app-header">
      <div class="brand-lockup">
        <div class="brand-mark"><UIcon name="i-lucide-play" /></div>
        <span>Course Shelf</span>
      </div>
      <div class="header-context">Private media library</div>
      <div class="header-spacer" />
      <UButton
        color="primary"
        icon="i-lucide-folder-open"
        label="Open folder"
        size="sm"
        @click="library.openFolder"
      />
    </header>

    <div class="tab-strip">
      <button
        class="app-tab"
        :class="{ 'app-tab-active': activeTab === 'library' }"
        type="button"
        @click="library.setActiveTab('library')"
      >
        <UIcon name="i-lucide-library" />
        <span>Library</span>
      </button>
      <button
        v-for="courseTab in visibleCourseTabs"
        :key="courseTab.id"
        class="app-tab"
        :class="{ 'app-tab-active': activeTab === courseTab.id }"
        type="button"
        @click="library.setActiveTab(courseTab.id)"
      >
        <span class="tab-course-dot" />
        <span class="tab-label">{{ courseTab.name }}</span>
        <span class="tab-close" role="button" tabindex="0" @click.stop="library.closeCourse(courseTab.id)">
          <UIcon name="i-lucide-x" />
        </span>
      </button>
    </div>

    <div class="workspace">
      <aside class="library-sidebar">
        <div class="sidebar-title-row">
          <span>Folders</span>
          <span class="sidebar-count">{{ recentCourses.length }}</span>
        </div>

        <UButton
          block
          color="neutral"
          icon="i-lucide-folder-plus"
          label="Add a course folder"
          variant="soft"
          @click="library.openFolder"
        />

        <div v-if="recentCourses.length" class="recent-course-list">
          <button
            v-for="recentCourse in recentCourses"
            :key="recentCourse.id"
            class="recent-course"
            :class="{ 'recent-course-active': currentCourse?.id === recentCourse.id }"
            type="button"
            @click="library.openRecentCourse(recentCourse)"
          >
            <span class="recent-course-icon"><UIcon name="i-lucide-folder" /></span>
            <span class="recent-course-copy">
              <strong>{{ recentCourse.name }}</strong>
              <small>{{ recentCourse.mediaCount }} media files</small>
            </span>
            <UIcon class="recent-course-arrow" name="i-lucide-chevron-right" />
          </button>
        </div>

        <div v-else class="sidebar-empty">
          <UIcon name="i-lucide-inbox" />
          <span>Folders you open will stay here.</span>
        </div>

        <div class="sidebar-footer">
          <div class="sidebar-footer-icon"><UIcon name="i-lucide-hard-drive" /></div>
          <div>
            <strong>Local by design</strong>
            <span>Nothing leaves this Mac.</span>
          </div>
        </div>
      </aside>

      <main class="main-content">
        <div v-if="loading" class="state-panel">
          <UIcon class="spin" name="i-lucide-loader-circle" />
          <span>Scanning your folder…</span>
        </div>

        <div v-else-if="error" class="state-panel state-panel-error">
          <UIcon name="i-lucide-circle-alert" />
          <span>{{ error }}</span>
          <UButton color="neutral" label="Try again" variant="soft" @click="library.openFolder" />
        </div>

        <section v-else-if="!currentCourse" class="welcome-panel">
          <div class="welcome-art">
            <div class="welcome-art-ring welcome-art-ring-outer" />
            <div class="welcome-art-ring welcome-art-ring-inner" />
            <UIcon name="i-lucide-play" />
          </div>
          <p class="eyebrow">YOUR COURSES, AT HOME</p>
          <h1>A quieter way to keep learning.</h1>
          <p class="welcome-copy">
            Choose a folder of videos or audio files. Course Shelf reads the names, builds a playlist, and remembers exactly where you stopped.
          </p>
          <UButton color="primary" icon="i-lucide-folder-open" label="Choose a folder" size="lg" @click="library.openFolder" />
          <span class="welcome-note">Local folders only. Progress is saved on this Mac.</span>
        </section>

        <section v-else class="course-view">
          <div class="course-heading">
            <div class="course-heading-copy">
              <p class="eyebrow">LOCAL COURSE</p>
              <h1>{{ currentCourse.name }}</h1>
              <p class="course-path" :title="currentCourse.rootPath">{{ currentCourse.rootPath }}</p>
            </div>
            <div class="course-heading-actions">
              <div class="course-progress-copy">
                <span>{{ courseProgress }}% complete</span>
                <small>{{ watchedCount }} of {{ currentCourse.lessons.length }} lessons watched</small>
              </div>
              <div class="course-heading-buttons">
                <UButton color="primary" icon="i-lucide-play" label="Continue" @click="resumeCurrentCourse" />
                <UButton color="neutral" icon="i-lucide-rotate-ccw" label="Reset course" variant="ghost" @click="requestCourseProgressReset" />
              </div>
            </div>
          </div>

          <div class="course-stats">
            <div class="course-stat"><strong>{{ currentCourse.lessons.length }}</strong><span>lessons</span></div>
            <div class="course-stat"><strong>{{ currentCourse.videoCount }}</strong><span>videos</span></div>
            <div v-if="currentCourse.audioCount" class="course-stat"><strong>{{ currentCourse.audioCount }}</strong><span>audio</span></div>
            <div class="course-stat"><strong>{{ formatCourseDuration(currentCourse.totalDuration) }}</strong><span>total play time</span></div>
            <div class="course-stat"><strong>{{ formatBytes(currentCourse.totalBytes) }}</strong><span>on disk</span></div>
          </div>

          <div v-if="currentCourse.lessons.length" class="course-layout" :class="{ 'course-layout-theater': isTheaterMode }">
            <div class="player-column">
              <div
                ref="playerStageRef"
                class="player-stage"
                :class="{
                  'player-stage-window-fullscreen': isFullscreen,
                  'player-stage-controls-hidden': !areControlsVisible,
                }"
                tabindex="0"
                @dblclick="toggleFullscreen"
                @focusin="handlePlayerFocusIn"
                @focusout="handlePlayerFocusOut"
                @pointerenter="handlePlayerPointerEnter"
                @pointerleave="handlePlayerPointerLeave"
                @pointermove="handlePlayerPointerMove"
                @pointerdown="handlePlayerPointerDown"
                @pointerup="handlePlayerPointerUp"
              >
                <video
                  v-if="currentLesson?.kind === 'video'"
                  ref="mediaRef"
                  :key="currentLesson.id"
                  class="media-element"
                  preload="metadata"
                  :src="currentLesson.mediaUrl"
                  @click="togglePlayback"
                  @durationchange="handleLoadedMetadata"
                  @ended="handleEnded"
                  @loadedmetadata="handleLoadedMetadata"
                  @pause="handlePause"
                  @play="handlePlay"
                  @timeupdate="handleTimeUpdate"
                />
                <div v-else class="audio-stage">
                  <div class="audio-orbit audio-orbit-large" />
                  <div class="audio-orbit audio-orbit-small" />
                  <div class="audio-glyph"><UIcon name="i-lucide-headphones" /></div>
                  <div class="audio-stage-copy">
                    <span>Audio lesson</span>
                    <strong>{{ currentLesson?.title }}</strong>
                  </div>
                  <audio
                    ref="mediaRef"
                    :key="currentLesson?.id"
                    preload="metadata"
                    :src="currentLesson?.mediaUrl"
                    @durationchange="handleLoadedMetadata"
                    @ended="handleEnded"
                    @loadedmetadata="handleLoadedMetadata"
                    @pause="handlePause"
                    @play="handlePlay"
                    @timeupdate="handleTimeUpdate"
                  />
                </div>

                <div class="player-topline">
                  <span>{{ currentLesson?.kind === 'audio' ? 'AUDIO' : 'VIDEO' }}</span>
                  <button v-if="currentLesson?.kind === 'video'" class="player-icon-button" type="button" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" @click="toggleFullscreen">
                    <UIcon :name="isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" />
                  </button>
                </div>

                <div class="player-controls">
                  <input
                    class="seek-range"
                    :max="mediaDuration"
                    min="0"
                    step="0.1"
                    type="range"
                    aria-label="Seek"
                    :value="currentTime"
                    @input="setSeek"
                  >
                  <div class="player-control-row">
                    <div class="player-control-group">
                      <button class="play-button" type="button" :title="isPlaying ? 'Pause' : 'Play'" @click="togglePlayback">
                        <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" />
                      </button>
                      <button
                        class="player-icon-button"
                        type="button"
                        title="Previous track"
                        aria-label="Previous track"
                        :disabled="!hasPreviousLesson"
                        @click="navigateLesson(-1)"
                      >
                        <UIcon name="i-lucide-skip-back" />
                      </button>
                      <button
                        class="player-icon-button"
                        type="button"
                        title="Next track"
                        aria-label="Next track"
                        :disabled="!hasNextLesson"
                        @click="navigateLesson(1)"
                      >
                        <UIcon name="i-lucide-skip-forward" />
                      </button>
                      <button class="player-icon-button" title="Back 10 seconds" type="button" @click="skip(-10)">
                        <UIcon name="i-lucide-rotate-ccw" />
                        <span class="skip-label">10</span>
                      </button>
                      <button class="player-icon-button" title="Forward 10 seconds" type="button" @click="skip(10)">
                        <UIcon name="i-lucide-rotate-cw" />
                        <span class="skip-label">10</span>
                      </button>
                      <span class="player-time">{{ formatDuration(currentTime) }} / {{ formatDuration(mediaDuration) }}</span>
                    </div>
                    <div class="player-control-group">
                      <button class="player-icon-button player-volume-button" type="button" :aria-label="volume === 0 ? 'Unmute' : 'Mute'" :title="volume === 0 ? 'Unmute' : 'Mute'" @click="toggleMute">
                        <UIcon class="volume-icon" :name="volumeIcon" />
                      </button>
                      <input class="volume-range" max="1" min="0" step="0.05" type="range" aria-label="Volume" :value="volume" @input="setVolume">
                      <select class="speed-select" :value="playbackRate" aria-label="Playback speed" @change="setPlaybackRate">
                        <option :value="0.75">0.75×</option>
                        <option :value="1">1×</option>
                        <option :value="1.25">1.25×</option>
                        <option :value="1.5">1.5×</option>
                        <option :value="2">2×</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div class="lesson-heading">
                <div>
                  <p class="lesson-kicker">LESSON {{ String(currentLesson?.sequence ?? 0).padStart(2, '0') }}</p>
                  <h2>{{ currentLesson?.title }}</h2>
                  <p>{{ currentLesson?.relativePath }}</p>
                </div>
                <div class="lesson-heading-actions">
                  <UButton
                    :color="currentLesson && isLessonComplete(currentLesson) ? 'success' : 'neutral'"
                    :icon="currentLesson && isLessonComplete(currentLesson) ? 'i-lucide-check' : 'i-lucide-circle-check'"
                    :label="currentLesson && isLessonComplete(currentLesson) ? 'Completed' : 'Mark complete'"
                    variant="soft"
                    @click="currentLesson && library.toggleComplete(currentLesson)"
                  />
                  <UButton color="error" icon="i-lucide-rotate-ccw" label="Reset progress" variant="ghost" @click="requestLessonProgressReset" />
                </div>
              </div>

              <div class="lesson-navigation">
                <button class="lesson-nav-button" type="button" :disabled="!currentLesson || currentCourse.lessons[0]?.id === currentLesson.id" @click="navigateLesson(-1)">
                  <UIcon name="i-lucide-arrow-left" />
                  <span><small>Previous</small><strong>Lesson</strong></span>
                </button>
                <button class="lesson-nav-button lesson-nav-next" type="button" :disabled="!currentLesson || currentCourse.lessons.at(-1)?.id === currentLesson.id" @click="navigateLesson(1)">
                  <span><small>Up next</small><strong>Lesson</strong></span>
                  <UIcon name="i-lucide-arrow-right" />
                </button>
              </div>
            </div>

            <aside class="playlist-panel">
              <div class="playlist-header">
                <div>
                  <p class="eyebrow">COURSE PLAYLIST</p>
                  <h2>Lessons</h2>
                </div>
                <span class="playlist-count">{{ watchedCount }}/{{ currentCourse.lessons.length }}</span>
              </div>
              <UInput v-model="search" class="playlist-search" icon="i-lucide-search" placeholder="Search lessons" size="lg" />

              <div class="playlist-scroll">
                <div v-if="!filteredLessons.length" class="playlist-empty">
                  <UIcon name="i-lucide-search-x" />
                  <span>No lessons match this search.</span>
                </div>
                <div v-for="group in lessonGroups" :key="group.section" class="lesson-group">
                  <div v-if="lessonGroups.length > 1" class="section-heading">{{ group.section }}</div>
                  <button
                    v-for="lesson in group.lessons"
                    :key="lesson.id"
                    class="lesson-row"
                    :class="{ 'lesson-row-active': currentLesson?.id === lesson.id }"
                    type="button"
                    @click="selectLesson(lesson)"
                  >
                    <span class="lesson-row-index">
                      <UIcon v-if="isLessonComplete(lesson)" name="i-lucide-check" />
                      <span v-else>{{ String(lesson.sequence).padStart(2, '0') }}</span>
                    </span>
                    <span class="lesson-row-copy">
                      <strong>{{ lesson.title }}</strong>
                      <small>{{ lesson.kind === 'audio' ? 'Audio' : 'Video' }} · {{ formatDuration(lesson.duration) }}</small>
                      <span v-if="progressForLesson(lesson)" class="lesson-row-progress"><span :style="{width: `${progressForLesson(lesson)}%`}" /></span>
                    </span>
                    <UIcon v-if="currentLesson?.id === lesson.id" class="lesson-row-playing" name="i-lucide-volume-2" />
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>

    <UModal v-model:open="isProgressResetDialogOpen" :title="progressResetTitle" :description="progressResetDescription">
      <template #body>
        <p class="progress-reset-dialog-copy">Your media files stay untouched. Only the saved playback position and completion state will be removed.</p>
      </template>
      <template #footer>
        <UButton color="neutral" label="Cancel" variant="ghost" :disabled="isResettingProgress" @click="cancelProgressReset" />
        <UButton color="error" icon="i-lucide-rotate-ccw" label="Reset progress" :loading="isResettingProgress" @click="confirmProgressReset" />
      </template>
    </UModal>
  </div>
</template>
