<template>
  <div class="course-shell">
    <nav class="tab-strip" aria-label="Open courses">
      <button
        class="app-tab"
        :class="{ 'app-tab-active': activeTab === 'library' }"
        type="button"
        :aria-current="activeTab === 'library' ? 'page' : undefined"
        @click="library.setActiveTab('library')"
      >
        <UIcon name="i-lucide-library" />
        <span>Library</span>
      </button>
      <div
        v-for="courseTab in visibleCourseTabs"
        :key="courseTab.id"
        class="app-tab"
        :class="{ 'app-tab-active': activeTab === courseTab.id }"
      >
        <button class="tab-select" type="button" :title="courseTab.name" :aria-current="activeTab === courseTab.id ? 'page' : undefined" @click="library.setActiveTab(courseTab.id)">
          <UIcon v-if="currentCourse?.id === courseTab.id && isPlaying" name="i-lucide-volume-2" aria-label="Playing" />
          <span v-else class="tab-course-dot" />
          <span class="tab-label">{{ courseTab.name }}</span>
        </button>
        <button class="tab-close" type="button" :aria-label="`Close ${courseTab.name} tab`" title="Close tab" @click="closeCourse(courseTab.id)">
          <UIcon name="i-lucide-x" />
        </button>
      </div>
      <div class="tab-strip-actions">
        <UButton
          class="tab-strip-open-folder"
          color="neutral"
          icon="i-lucide-folder-plus"
          variant="ghost"
          aria-label="Add a course folder"
          title="Add a course folder"
          :loading="loading"
          @click="library.openFolder"
        />
        <UButton color="neutral" icon="i-lucide-keyboard" variant="ghost" aria-label="Keyboard shortcuts (?)" title="Keyboard shortcuts (?)" @click="isShortcutsOpen = true" />
      </div>
    </nav>

    <div class="workspace" :class="{ 'workspace-course': !isLibraryActive }">
      <aside v-if="isLibraryActive" class="library-sidebar">
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
          :disabled="loading"
          @click="library.openFolder"
        />

        <div v-if="recentCourses.length" class="recent-course-list">
          <div
            v-for="recentCourse in recentCourses"
            :key="recentCourse.id"
            class="recent-course"
            :class="{ 'recent-course-active': activeTab === recentCourse.id }"
          >
            <button class="recent-course-open" type="button" :title="recentCourse.rootPath" :disabled="loading" @click="library.openRecentCourse(recentCourse)">
              <span class="recent-course-icon"><UIcon name="i-lucide-folder" /></span>
              <span class="recent-course-copy">
                <strong>{{ recentCourse.name }}</strong>
                <small>{{ recentCourse.mediaCount }} media files</small>
              </span>
              <UIcon class="recent-course-arrow" name="i-lucide-chevron-right" />
            </button>
            <button
              class="recent-course-remove"
              type="button"
              :aria-label="`Remove ${recentCourse.name} from collection`"
              title="Remove from collection"
              :disabled="loading"
              @click="removeCourse(recentCourse)"
            >
              <UIcon name="i-lucide-x" />
            </button>
          </div>
        </div>
      </aside>

      <main class="main-content">
        <div v-if="error" class="error-banner" role="alert">
          <UIcon name="i-lucide-circle-alert" />
          <span>{{ error }}</span>
          <UButton color="neutral" icon="i-lucide-x" aria-label="Dismiss error" variant="ghost" @click="error = ''" />
        </div>

        <div v-if="library.progressError.value" class="error-banner" role="alert">
          <UIcon name="i-lucide-save-off" />
          <span>Saved progress could not be updated. {{ library.progressError.value }}</span>
          <UButton label="Retry update" color="neutral" variant="soft" :loading="isRetryingProgress" @click="retryProgressWrites" />
        </div>

        <div v-if="loading && !isLibraryActive" class="loading-banner" role="status">
          <UIcon class="spin" name="i-lucide-loader-circle" />
          <span>{{ library.loadingMessage.value }}</span>
        </div>

        <div v-if="loading && isLibraryActive" class="state-panel" role="status">
          <UIcon class="spin" name="i-lucide-loader-circle" />
          <span>{{ library.loadingMessage.value }}</span>
        </div>

        <section v-if="isLibraryActive && currentCourse && currentLesson" class="library-player" aria-label="Current playback">
          <button class="play-button" type="button" :aria-label="isPlaying ? 'Pause' : 'Play'" @click="togglePlayback">
            <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" />
          </button>
          <div class="library-player-copy">
            <span>{{ playbackError ? 'Playback unavailable' : isPlaying ? 'Now playing' : 'Paused' }} · {{ currentCourse.name }}</span>
            <strong>{{ currentLesson.title }}</strong>
            <small>{{ formatDuration(currentTime) }} / {{ formatDuration(mediaDuration) }}</small>
          </div>
          <UButton color="neutral" icon="i-lucide-arrow-up-right" label="Back to course" variant="soft" @click="library.setActiveTab(currentCourse.id)" />
        </section>

        <section v-if="isLibraryActive && !loading && recentCourses.length" class="library-view">
          <div class="library-heading">
            <h1>Your courses</h1>
          </div>
          <div class="course-grid">
            <article v-for="course in recentCourses" :key="course.id" class="course-card">
              <button class="course-card-open" type="button" @click="library.openRecentCourse(course)">
                <UIcon name="i-lucide-folder" />
                <strong>{{ course.name }}</strong>
                <span :title="course.rootPath">{{ course.rootPath }}</span>
                <small>{{ course.mediaCount }} {{ course.mediaCount === 1 ? 'lesson' : 'lessons' }}</small>
              </button>
              <UButton class="course-card-reveal" color="neutral" icon="i-lucide-folder-search" label="Show in folder" variant="ghost" @click="revealCourse(course.rootPath)" />
              <button class="course-card-remove" type="button" :aria-label="`Remove ${course.name} from collection`" title="Remove from collection" @click="removeCourse(course)"><UIcon name="i-lucide-x" /></button>
            </article>
          </div>
        </section>

        <section v-else-if="isLibraryActive && !loading" class="welcome-panel">
          <div class="welcome-art">
            <div class="welcome-art-ring welcome-art-ring-outer" />
            <div class="welcome-art-ring welcome-art-ring-inner" />
            <UIcon name="i-lucide-play" />
          </div>
          <h1>Your course library</h1>
          <p class="welcome-copy">
            Choose a folder of videos or audio files.
          </p>
          <UButton color="primary" icon="i-lucide-folder-open" label="Choose a folder" size="lg" @click="library.openFolder" />
        </section>

        <section v-if="currentCourse" v-show="!isLibraryActive" class="course-view">
          <div v-if="!currentCourse.lessons.length" class="empty-course" role="status">
            <UIcon name="i-lucide-folder-search" />
            <h2>No lessons found</h2>
            <p>Choose a folder containing video or audio files. Subfolders are included.</p>
            <div class="empty-course-actions">
              <UButton color="primary" icon="i-lucide-folder-open" label="Choose another folder" @click="library.openFolder" />
              <UButton color="neutral" icon="i-lucide-folder-search" label="Show in folder" variant="ghost" @click="revealCourse(currentCourse.rootPath)" />
            </div>
          </div>

          <div v-if="currentCourse.lessons.length" class="course-layout" :class="{ 'course-layout-theater': isTheaterMode }">
            <div class="player-column">
              <div class="course-title-row">
                <h1 :title="currentCourse.rootPath">{{ currentCourse.name }}</h1>
                <UDropdownMenu :items="courseMenuItems" :content="{align: 'end'}">
                  <UButton color="neutral" icon="i-lucide-ellipsis" variant="ghost" size="sm" aria-label="Course actions" title="Course actions" />
                </UDropdownMenu>
              </div>
              <div
                ref="playerStageRef"
                class="player-stage"
                :class="{
                  'player-stage-window-fullscreen': isFullscreen,
                  'player-stage-controls-hidden': !areControlsVisible,
                }"
                tabindex="0"
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
                  @dblclick.stop="toggleFullscreen"
                  @error="handleMediaError"
                  @waiting="isBuffering = true"
                  @playing="isBuffering = false"
                  @canplay="isBuffering = false"
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
                    @error="handleMediaError"
                    @waiting="isBuffering = true"
                    @playing="isBuffering = false"
                    @canplay="isBuffering = false"
                    @durationchange="handleLoadedMetadata"
                    @ended="handleEnded"
                    @loadedmetadata="handleLoadedMetadata"
                    @pause="handlePause"
                    @play="handlePlay"
                    @timeupdate="handleTimeUpdate"
                  />
                </div>

                <div v-if="playbackError" class="playback-message" role="alert">
                  <UIcon name="i-lucide-circle-alert" />
                  <p>{{ playbackError }}</p>
                  <div>
                    <UButton label="Try again" color="primary" @click="retryPlayback" />
                    <UButton label="Open in default app" color="neutral" variant="soft" @click="openMediaExternally" />
                  </div>
                </div>
                <div v-else-if="isBuffering" class="buffering-indicator" role="status" aria-label="Buffering"><UIcon class="spin" name="i-lucide-loader-circle" /></div>

                <div class="player-topline">
                  <div class="player-view-controls">
                    <button class="player-icon-button" type="button" :aria-pressed="isTheaterMode" :aria-label="isTheaterMode ? 'Exit theater mode' : 'Theater mode'" :title="isTheaterMode ? 'Exit theater mode (T)' : 'Theater mode (T)'" @click="toggleTheaterMode"><UIcon name="i-lucide-panel-top" /></button>
                    <button v-if="currentLesson?.kind === 'video' || isFullscreen" class="player-icon-button" type="button" :aria-label="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" :title="isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'" @click="toggleFullscreen">
                      <UIcon :name="isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" />
                    </button>
                  </div>
                </div>

                <div class="player-controls">
                  <input
                    class="seek-range"
                    :max="mediaDuration"
                    min="0"
                    step="0.1"
                    type="range"
                    aria-label="Seek"
                    :aria-valuetext="`${formatDuration(currentTime)} of ${formatDuration(mediaDuration)}`"
                    :disabled="!loadedDuration || Boolean(playbackError)"
                    :value="currentTime"
                    @input="setSeek"
                  >
                  <div class="player-control-row">
                    <div class="player-control-group">
                      <button class="play-button" type="button" :aria-label="isPlaying ? 'Pause' : 'Play'" :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'" @click="togglePlayback">
                        <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" />
                      </button>
                      <button
                        class="player-icon-button"
                        type="button"
                        :title="previousLesson ? `Previous: ${previousLesson.title} (Shift+P)` : 'Previous track'"
                        aria-label="Previous track"
                        :disabled="!hasPreviousLesson"
                        @click="navigateLesson(-1)"
                      >
                        <UIcon name="i-lucide-skip-back" />
                      </button>
                      <button
                        class="player-icon-button"
                        type="button"
                        :title="nextLesson ? `Next: ${nextLesson.title} (Shift+N)` : 'Next track'"
                        aria-label="Next track"
                        :disabled="!hasNextLesson"
                        @click="navigateLesson(1)"
                      >
                        <UIcon name="i-lucide-skip-forward" />
                      </button>
                      <button class="player-icon-button" title="Back 10 seconds (J)" aria-label="Back 10 seconds" type="button" @click="skip(-10)">
                        <UIcon name="i-lucide-rotate-ccw" />
                        <span class="skip-label">10</span>
                      </button>
                      <button class="player-icon-button" title="Forward 10 seconds (L)" aria-label="Forward 10 seconds" type="button" @click="skip(10)">
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
                  <UButton color="error" icon="i-lucide-rotate-ccw" label="Reset progress" variant="ghost" @click="currentLesson && requestLessonProgressReset(currentLesson)" />
                </div>
              </div>
            </div>

            <aside class="playlist-panel">
              <div class="playlist-header">
                <div class="course-progress" :title="`${watchedCount} of ${currentCourse.lessons.length} lessons watched`">
                  <span class="course-progress-bar"><span :style="{width: `${courseProgress}%`}" /></span>
                  <span>{{ courseProgress }}% · {{ watchedCount }}/{{ currentCourse.lessons.length }}</span>
                </div>
                <p class="course-meta">{{ courseMeta }}</p>
              </div>
              <UInput v-model="search" class="playlist-search" icon="i-lucide-search" type="search" aria-label="Search lessons" placeholder="Search lessons" size="md" />

              <div ref="playlistRef" class="playlist-scroll">
                <div v-if="!filteredLessons.length" class="playlist-empty">
                  <UIcon name="i-lucide-search-x" />
                  <span>No lessons match this search.</span>
                </div>
                <div v-for="group in lessonGroups" :key="group.section" class="lesson-group">
                  <div v-if="lessonGroups.length > 1" class="section-heading">{{ group.section }}</div>
                  <div
                    v-for="lesson in group.lessons"
                    :key="lesson.id"
                    class="lesson-row"
                    :class="{ 'lesson-row-active': currentLesson?.id === lesson.id }"
                  >
                    <button class="lesson-row-select" type="button" :aria-current="currentLesson?.id === lesson.id ? 'true' : undefined" :title="lesson.relativePath" @click="handleLessonRowClick(lesson)">
                      <span class="lesson-row-index">
                        <UIcon v-if="isLessonComplete(lesson)" name="i-lucide-check" />
                        <span v-else>{{ String(lesson.sequence).padStart(2, '0') }}</span>
                      </span>
                      <span class="lesson-row-copy">
                        <strong>{{ lesson.title }}</strong>
                        <small>{{ lesson.kind === 'audio' ? 'Audio · ' : '' }}{{ formatDuration(library.lessonProgress(currentCourse.id, lesson.id)?.duration || lesson.duration) }}</small>
                        <span v-if="progressForLesson(lesson)" class="lesson-row-progress"><span :style="{width: `${progressForLesson(lesson)}%`}" /></span>
                      </span>
                      <template v-if="currentLesson?.id === lesson.id">
                        <template v-if="isPlaying">
                          <UIcon class="lesson-row-playing lesson-row-playing-idle" name="i-lucide-volume-2" aria-label="Playing" />
                          <UIcon class="lesson-row-playing lesson-row-playing-hover" name="i-lucide-pause" aria-label="Pause" />
                        </template>
                        <UIcon v-else class="lesson-row-playing" name="i-lucide-play" aria-label="Play" />
                      </template>
                    </button>
                    <button class="lesson-row-reset" type="button" :aria-label="`Reset progress for ${lesson.title}`" :title="`Reset progress for ${lesson.title}`" @click="requestLessonProgressReset(lesson)">
                      <UIcon name="i-lucide-rotate-ccw" />
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>

    <UModal v-model:open="isProgressResetDialogOpen" :title="progressResetTitle" :description="progressResetDescription" :dismissible="!isResettingProgress" :close="!isResettingProgress">
      <template #body>
        <p class="progress-reset-dialog-copy">Your media files stay untouched. Only the saved playback position and completion state will be removed.</p>
      </template>
      <template #footer>
        <UButton color="neutral" label="Cancel" variant="ghost" :disabled="isResettingProgress" @click="cancelProgressReset" />
        <UButton color="error" icon="i-lucide-rotate-ccw" label="Reset progress" :loading="isResettingProgress" @click="confirmProgressReset" />
      </template>
    </UModal>

    <UModal v-model:open="isShortcutsOpen" title="Keyboard shortcuts" description="Available while a lesson is open. Press ? to show this list.">
      <template #body>
        <dl class="shortcut-list">
          <div><dt>Play / pause</dt><dd>Space or K</dd></div>
          <div><dt>Back / forward 10 seconds</dt><dd>J / L</dd></div>
          <div><dt>Back / forward 5 seconds</dt><dd>← / →</dd></div>
          <div><dt>Volume / mute</dt><dd>↑ / ↓ · M</dd></div>
          <div><dt>Fullscreen / theater</dt><dd>F / T</dd></div>
          <div><dt>Previous / next lesson</dt><dd>Shift + P / N</dd></div>
          <div><dt>Seek to 0–90%</dt><dd>0–9</dd></div>
          <div><dt>Slower / faster</dt><dd>&lt; / &gt;</dd></div>
          <div><dt>Frame back / forward (paused)</dt><dd>, / .</dd></div>
        </dl>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import {useDebounceFn, useResizeObserver, useStorage} from '@vueuse/core';
import {nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
import type {IMediaLesson, IRecentCourse} from '../../shared/types';
import {useCourseLibrary} from '../composables/useCourseLibrary';

type TProgressResetRequest = {
  scope: 'lesson' | 'course';
  courseId: string;
  lessonId?: string;
  lessonTitle?: string;
};

interface IPlaybackSession {
  courseId: string;
  lessonId: string;
  media: HTMLMediaElement;
  ready: boolean;
}

const library = useCourseLibrary();
const toast = useToast();
useColorMode().preference = 'dark';
const recentCourses = library.recentCourses;
const openCourses = library.openCourses;
const activeTab = library.activeTab;
const loading = library.loading;
const error = library.error;
const search = ref('');
const mediaRef = ref<HTMLVideoElement | HTMLAudioElement | null>(null);
const playerStageRef = ref<HTMLElement | null>(null);
const playlistRef = ref<HTMLElement | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const loadedDuration = ref(0);
const volume = useStorage('course-shelf-volume', 1);
const lastVolume = useStorage('course-shelf-last-volume', 1);
const playbackRate = useStorage('course-shelf-playback-rate', 1);
volume.value = Number.isFinite(volume.value) ? Math.max(0, Math.min(1, volume.value)) : 1;
lastVolume.value = Number.isFinite(lastVolume.value) && lastVolume.value > 0 ? Math.min(1, lastVolume.value) : 1;
playbackRate.value = [0.75, 1, 1.25, 1.5, 2].includes(playbackRate.value) ? playbackRate.value : 1;
const playbackError = ref('');
const isBuffering = ref(false);
const isShortcutsOpen = ref(false);
const isFullscreen = ref(false);
const isTheaterMode = ref(false);
const areControlsVisible = ref(true);
const isPlayerFocused = ref(false);
const autoplayLessonId = ref<string | null>(null);
const progressResetRequest = ref<TProgressResetRequest | null>(null);
const isProgressResetDialogOpen = ref(false);
const isResettingProgress = ref(false);
const isRetryingProgress = ref(false);
let controlsHideTimer: ReturnType<typeof setTimeout> | null = null;
let removeWindowFullscreenListener: (() => void) | null = null;
let isPointerInteraction = false;
let lessonLoadRequest = 0;
let progressPersistenceGeneration = 0;
let isProgressPersistenceSuspended = false;
let playbackSession: IPlaybackSession | null = null;

const currentCourse = library.playbackCourse;
const currentLesson = library.playbackLesson;
const isLibraryActive = computed(() => activeTab.value === 'library');

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
}, 900, {maxWait: 1500});

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
const previousLesson = computed(() => currentCourse.value?.lessons[currentLessonIndex.value - 1]);
const nextLesson = computed(() => currentCourse.value?.lessons[currentLessonIndex.value + 1]);
const continueLabel = computed(() => courseProgress.value === 100 ? 'Watch again' : watchedCount.value || currentProgress.value?.position ? 'Continue' : 'Start course');
const courseMeta = computed(() => {
  const course = currentCourse.value;
  if (!course) {
    return '';
  }
  const parts = [`Lesson ${currentLessonIndex.value + 1} of ${course.lessons.length}`];
  if (course.audioCount && course.videoCount) {
    parts.push(`${course.videoCount} video, ${course.audioCount} audio`);
  }
  if (course.totalDuration) {
    parts.push(formatCourseDuration(course.totalDuration));
  }
  parts.push(formatBytes(course.totalBytes));
  return parts.join(' · ');
});
const courseMenuItems = computed(() => {
  const course = currentCourse.value;
  if (!course) {
    return [];
  }
  return [
    [
      {label: continueLabel.value, icon: 'i-lucide-play', disabled: !currentLesson.value, onSelect: resumeCurrentCourse},
      {label: 'Show in folder', icon: 'i-lucide-folder-search', onSelect: () => revealCourse(course.rootPath)},
    ],
    [
      {label: 'Reset course progress', icon: 'i-lucide-rotate-ccw', color: 'error' as const, onSelect: requestCourseProgressReset},
    ],
  ];
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
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '—';
  }
  const totalSeconds = Math.max(0, Math.floor(seconds));
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
    return '—';
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
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

function requestLessonProgressReset(lesson: IMediaLesson) {
  const course = currentCourse.value;
  if (!course) {
    return;
  }
  progressResetRequest.value = {
    scope: 'lesson',
    courseId: course.id,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
  };
  isProgressResetDialogOpen.value = true;
  if (lesson.id === currentLesson.value?.id) {
    mediaRef.value?.pause();
  }
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
  mediaRef.value?.pause();
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
  const resetMedia = resetsCurrentLesson && isCurrentCourse ? mediaRef.value : null;
  const previousPosition = resetMedia?.currentTime ?? 0;
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
    if (resetMedia && mediaRef.value === resetMedia) {
      resetMedia.currentTime = previousPosition;
      currentTime.value = previousPosition;
      isProgressPersistenceSuspended = false;
    }
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
  playbackError.value = '';
  void media.play().catch((cause: unknown) => {
    if (mediaRef.value === media) {
      isPlaying.value = false;
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        playbackError.value = cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Press Play to start this lesson.'
          : 'This lesson could not be played. Try again or open it in your default media app.';
      }
      isBuffering.value = false;
      showPlayerControls();
    }
  });
}

function selectLesson(lesson: IMediaLesson, autoplay = true) {
  const isCurrentLesson = currentLesson.value?.id === lesson.id;
  autoplayLessonId.value = autoplay ? lesson.id : null;
  library.selectLesson(lesson);
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

function handleLessonRowClick(lesson: IMediaLesson) {
  if (currentLesson.value?.id === lesson.id) {
    togglePlayback();
  } else {
    selectLesson(lesson);
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
  const input = event.target as HTMLInputElement;
  seekTo(Number(input.value));
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
  if (!isPlaying.value || isPlayerFocused.value || isPointerInteraction) {
    return;
  }
  controlsHideTimer = setTimeout(() => {
    controlsHideTimer = null;
    if (isPlaying.value && !isPlayerFocused.value && !isPointerInteraction) {
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
  if (isLibraryActive.value) return;
  isTheaterMode.value = !isTheaterMode.value;
  showPlayerControls();
}

async function toggleFullscreen() {
  if (isLibraryActive.value && !isFullscreen.value) return;
  if (currentLesson.value?.kind !== 'video' && !isFullscreen.value) {
    return;
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    const api = import.meta.client ? window.courseShelf : null;
    if (api) {
      isFullscreen.value = await api.setWindowFullscreen(!isFullscreen.value);
      return;
    }
    await playerStageRef.value?.requestFullscreen();
  } catch {
    toast.add({title: 'Fullscreen is unavailable', color: 'error'});
  }
}

async function saveCurrentProgress(completed = false) {
  if (isProgressPersistenceSuspended) {
    return;
  }
  const session = playbackSession;
  if (!session?.ready) {
    return;
  }
  const media = session.media;
  const position = media.currentTime;
  const duration = Number.isFinite(media.duration) ? media.duration : 0;
  const previous = library.lessonProgress(session.courseId, session.lessonId);
  await library.saveProgress(session.courseId, session.lessonId, {
    position: Number.isFinite(position) ? position : 0,
    duration,
    completed: completed || Boolean(previous?.completed),
    updatedAt: Date.now(),
  }).catch(() => {
    // The library retains the unsaved update and exposes a recoverable error.
  });
}

function isCurrentMediaEvent(event: Event) {
  return event.currentTarget === mediaRef.value && event.currentTarget === playbackSession?.media;
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
  if (!playbackSession || loadedDuration.value <= 0 || playbackSession.ready) {
    return;
  }
  playbackSession.ready = true;
  media.volume = volume.value;
  media.muted = volume.value === 0;
  media.playbackRate = playbackRate.value;
  const savedPosition = currentProgress.value?.position ?? 0;
  if (!currentProgress.value?.completed && savedPosition > 0 && savedPosition < media.duration) {
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
  playbackError.value = '';
  showPlayerControls();
}

function handlePause(event: Event) {
  if (!isCurrentMediaEvent(event)) {
    return;
  }
  isPlaying.value = false;
  isBuffering.value = false;
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
  if (isProgressResetDialogOpen.value || isShortcutsOpen.value || document.querySelector('[role="dialog"]')) {
    return;
  }
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) {
    return;
  }
  if (target instanceof HTMLButtonElement && (event.code === 'Space' || event.key === 'Enter')) {
    return;
  }
  if (event.key === '?') {
    event.preventDefault();
    isShortcutsOpen.value = true;
    return;
  }
  if (!currentLesson.value) {
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

watch([() => currentCourse.value?.id, () => currentLesson.value?.id], async ([courseId, lessonId]) => {
  const requestId = ++lessonLoadRequest;
  void saveCurrentProgress();
  playbackSession?.media.pause();
  playbackSession = null;
  progressPersistenceGeneration += 1;
  isProgressPersistenceSuspended = false;
  playbackError.value = '';
  isBuffering.value = false;
  currentTime.value = 0;
  loadedDuration.value = 0;
  isPlaying.value = false;
  showPlayerControls();
  await nextTick();
  if (requestId !== lessonLoadRequest || currentLesson.value?.id !== lessonId) {
    return;
  }
  const media = mediaRef.value;
  if (!media) {
    if (isFullscreen.value) {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      } else {
        void window.courseShelf?.setWindowFullscreen(false);
      }
      isFullscreen.value = false;
    }
    return;
  }
  if (!courseId || !lessonId) {
    return;
  }
  playbackSession = {courseId, lessonId, media, ready: false};
  const shouldAutoplay = autoplayLessonId.value === lessonId;
  autoplayLessonId.value = null;
  media.load();
  if (shouldAutoplay) {
    isPlayerFocused.value = false;
    playMedia(media);
  }
  revealCurrentLesson();
}, {immediate: true});

function revealCurrentLesson() {
  const playlist = playlistRef.value;
  const row = playlist?.querySelector<HTMLElement>('[aria-current="true"]');
  if (!playlist || !row) return;
  const panelBounds = playlist.getBoundingClientRect();
  const rowBounds = row.getBoundingClientRect();
  if (rowBounds.top < panelBounds.top) playlist.scrollTop -= Math.ceil(panelBounds.top - rowBounds.top) + 2;
  else if (rowBounds.bottom > panelBounds.bottom) playlist.scrollTop += Math.ceil(rowBounds.bottom - panelBounds.bottom) + 2;
}

useResizeObserver(playlistRef, revealCurrentLesson);

function handleMediaError(event: Event) {
  if (!isCurrentMediaEvent(event)) return;
  isPlaying.value = false;
  isBuffering.value = false;
  playbackError.value = 'This file is unavailable or its format is not supported. Try again or open it in your default media app.';
  showPlayerControls();
}

function retryPlayback() {
  const media = mediaRef.value;
  if (!media) return;
  playbackError.value = '';
  if (playbackSession) playbackSession.ready = false;
  media.load();
  playMedia(media);
}

async function openMediaExternally() {
  if (!currentLesson.value || !window.courseShelf) return;
  try {
    await window.courseShelf.openMediaExternally(currentLesson.value.mediaUrl);
  } catch {
    toast.add({title: 'Could not open this file', description: 'Check that the course folder is still available.', color: 'error'});
  }
}

async function revealCourse(rootPath: string) {
  try {
    if (!window.courseShelf) throw new Error('Showing folders is available in the desktop app.');
    await window.courseShelf.revealCourse(rootPath);
  } catch (cause) {
    toast.add({title: 'Could not reveal the course', description: cause instanceof Error ? cause.message : 'Check that the course folder is still available.', color: 'error'});
  }
}

async function removeCourse(course: IRecentCourse) {
  await library.removeRecentCourse(course);
  if (!recentCourses.value.some((candidate) => candidate.id === course.id)) {
    toast.add({title: 'Course removed', description: 'Its files and saved progress are kept.', actions: [{label: 'Undo', onClick: () => library.openRecentCourse(course)}]});
  }
}

async function closeCourse(courseId: string) {
  library.closeCourse(courseId);
  await nextTick();
  document.querySelector<HTMLButtonElement>('.tab-strip [aria-current="page"]')?.focus();
}

function saveBeforeLeaving() {
  void saveCurrentProgress();
}

async function retryProgressWrites() {
  isRetryingProgress.value = true;
  const session = playbackSession;
  const previousProgress = session && library.lessonProgress(session.courseId, session.lessonId);
  try {
    await library.retryProgressWrites();
    if (session && session === playbackSession && previousProgress && !library.lessonProgress(session.courseId, session.lessonId)) {
      progressPersistenceGeneration += 1;
      isProgressPersistenceSuspended = true;
      resetCurrentMedia();
    }
  } catch {
    // Keep the actionable storage error visible until a write succeeds.
  } finally {
    isRetryingProgress.value = false;
  }
}

watch(() => currentCourse.value?.id, () => {search.value = '';});
watch(search, async () => {if (!search.value) {await nextTick(); revealCurrentLesson();}});

watch(isFullscreen, syncFullscreenDocumentClass);

onMounted(async () => {
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('keydown', handleKeyboard);
  window.addEventListener('pagehide', saveBeforeLeaving);
  window.addEventListener('beforeunload', saveBeforeLeaving);
  if (import.meta.client && window.courseShelf) {
    removeWindowFullscreenListener = window.courseShelf.onWindowFullscreenChanged((fullscreen) => {
      isFullscreen.value = fullscreen;
    });
  }
  syncFullscreenDocumentClass(isFullscreen.value);
  await library.load();
});

onUnmounted(() => {
  void saveCurrentProgress();
  clearControlsHideTimer();
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  document.removeEventListener('keydown', handleKeyboard);
  window.removeEventListener('pagehide', saveBeforeLeaving);
  window.removeEventListener('beforeunload', saveBeforeLeaving);
  removeWindowFullscreenListener?.();
  removeWindowFullscreenListener = null;
  syncFullscreenDocumentClass(false);
});
</script>
