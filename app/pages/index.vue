<template>
  <div class="folder-shell">
    <nav class="tab-strip" :aria-label="t('library.openFolders')">
      <button
        class="app-tab app-tab-library"
        :class="{ 'app-tab-active': activeTab === 'library' }"
        type="button"
        :aria-current="activeTab === 'library' ? 'page' : undefined"
        @click="library.setActiveTab('library')"
      >
        <UIcon name="i-lucide-library" />
        <span>{{ t('library.library') }}</span>
      </button>
      <div
        v-for="folderTab in visibleFolderTabs"
        :key="folderTab.id"
        class="app-tab"
        :class="{ 'app-tab-active': activeTab === folderTab.id }"
      >
        <button class="tab-select" type="button" :title="folderTab.name" :aria-current="activeTab === folderTab.id ? 'page' : undefined" @click="library.setActiveTab(folderTab.id)">
          <UIcon v-if="currentFolder?.id === folderTab.id && isPlaying" name="i-lucide-volume-2" :aria-label="t('library.playing')" />
          <span v-else class="tab-folder-dot" />
          <span class="tab-label">{{ folderTab.name }}</span>
        </button>
        <button class="tab-close" type="button" :aria-label="t('library.closeTab', {name: folderTab.name})" :title="t('library.closeTab', {name: folderTab.name})" @click="closeFolder(folderTab.id)">
          <UIcon name="i-lucide-x" />
        </button>
      </div>
      <div class="tab-strip-actions">
        <ThemeToggle
          :theme="activeTheme"
          :switch-to-light-label="t('settings.switchToLightTheme')"
          :switch-to-dark-label="t('settings.switchToDarkTheme')"
          @change="selectTheme"
        />
        <LanguageMenu :locale="activeLocale" :label="t('settings.language')" @change="selectLocale" />
        <UButton color="neutral" icon="i-lucide-keyboard" variant="ghost" :aria-label="t('player.keyboardShortcuts')" :title="t('player.keyboardShortcuts')" @click="isShortcutsOpen = true" />
      </div>
    </nav>

    <div class="workspace" :class="{ 'workspace-folder': !isLibraryActive }">
      <aside v-if="isLibraryActive" class="library-sidebar">
        <div class="sidebar-title-row">
          <span>{{ t('library.folders') }}</span>
          <span class="sidebar-count">{{ recentFolders.length }}</span>
        </div>

        <div v-if="recentFolders.length" class="recent-folder-list">
          <div
            v-for="recentFolder in recentFolders"
            :key="recentFolder.id"
            class="recent-folder"
            :class="{ 'recent-folder-active': activeTab === recentFolder.id }"
          >
            <button class="recent-folder-open" type="button" :title="recentFolder.rootPath" :disabled="loading" @click="library.openRecentFolder(recentFolder)">
              <span class="recent-folder-icon"><UIcon name="i-lucide-folder" /></span>
              <span class="recent-folder-copy">
                <strong>{{ recentFolder.name }}</strong>
                <small>{{ formatLessonCount(recentFolder.mediaCount) }}</small>
              </span>
              <UIcon class="recent-folder-arrow" name="i-lucide-chevron-right" />
            </button>
            <button
              class="recent-folder-remove"
              type="button"
              :aria-label="t('library.removeFromCollection', {name: recentFolder.name})"
              :title="t('library.removeFolder')"
              :disabled="loading"
              @click="removeFolder(recentFolder)"
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
          <UButton color="neutral" icon="i-lucide-x" :aria-label="t('library.dismissError')" variant="ghost" @click="error = ''" />
        </div>

        <div v-if="library.progressError.value" class="error-banner" role="alert">
          <UIcon name="i-lucide-save-off" />
          <span>{{ t('library.savedProgressError') }} {{ library.progressError.value }}</span>
          <UButton :label="t('library.retryUpdate')" color="neutral" variant="soft" :loading="isRetryingProgress" @click="retryProgressWrites" />
        </div>

        <div v-if="loading && !isLibraryActive" class="loading-banner" role="status">
          <UIcon class="spin" name="i-lucide-loader-circle" />
          <span>{{ library.loadingMessage.value }}</span>
        </div>

        <div v-if="loading && isLibraryActive" class="state-panel" role="status">
          <UIcon class="spin" name="i-lucide-loader-circle" />
          <span>{{ library.loadingMessage.value }}</span>
        </div>

        <section v-if="isLibraryActive && currentFolder && currentLesson" class="library-player" :aria-label="t('library.currentPlayback')">
          <button class="play-button" type="button" :aria-label="isPlaying ? t('player.pause') : t('player.play')" @click="togglePlayback">
            <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" />
          </button>
          <div class="library-player-copy">
            <span>{{ playbackError ? t('library.playbackUnavailable') : isPlaying ? t('library.nowPlaying') : t('library.paused') }} · {{ currentFolder.name }}</span>
            <strong>{{ currentLesson.title }}</strong>
            <small>{{ formatDuration(currentTime) }} / {{ formatDuration(mediaDuration) }}</small>
          </div>
          <UButton color="neutral" icon="i-lucide-arrow-up-right" :label="t('library.backToPlayer')" variant="soft" @click="library.setActiveTab(currentFolder.id)" />
        </section>

        <section v-if="isLibraryActive && !loading && recentFolders.length" class="library-view">
          <div class="library-heading">
            <h1>{{ t('library.yourFolders') }}</h1>
            <UButton color="primary" icon="i-lucide-folder-plus" :label="t('library.addFolder')" @click="library.openFolder" />
          </div>
          <div class="folder-grid">
            <article v-for="folder in recentFolders" :key="folder.id" class="folder-card">
              <button class="folder-card-open" type="button" @click="library.openRecentFolder(folder)">
                <UIcon name="i-lucide-folder" />
                <strong>{{ folder.name }}</strong>
                <span :title="folder.rootPath">{{ folder.rootPath }}</span>
                <small>{{ formatLessonCount(folder.mediaCount) }}</small>
              </button>
              <UButton v-if="capabilities.revealFolder" class="folder-card-reveal" color="neutral" icon="i-lucide-folder-search" :label="t('library.showInFolder')" variant="ghost" @click="revealFolder(folder.rootPath)" />
              <button class="folder-card-remove" type="button" :aria-label="t('library.removeFromCollection', {name: folder.name})" :title="t('library.removeFolder')" @click="removeFolder(folder)"><UIcon name="i-lucide-x" /></button>
            </article>
          </div>
        </section>

        <section v-else-if="isLibraryActive && !loading" class="welcome-panel">
          <div class="welcome-art">
            <div class="welcome-art-ring welcome-art-ring-outer" />
            <div class="welcome-art-ring welcome-art-ring-inner" />
            <UIcon name="i-lucide-play" />
          </div>
          <h1>{{ t('library.yourLibrary') }}</h1>
          <p class="welcome-copy">
            {{ t('library.chooseFolderHint') }}
          </p>
          <UButton color="primary" icon="i-lucide-folder-open" :label="t('library.chooseFolder')" size="lg" @click="library.openFolder" />
        </section>

        <footer v-if="isLibraryActive && !loading" class="library-footer">
          {{ t('footer.copyright') }} © 2026 <a href="https://evb-stack.com" title="evb-stack.com" target="_blank" rel="noreferrer">Eugene Barsky</a><template v-if="!capabilities.revealFolder"> · <a href="https://evb-player.vercel.app/" target="_blank" rel="noreferrer">{{ t('footer.desktopDownloads') }}</a></template>
        </footer>

        <section v-if="currentFolder" v-show="!isLibraryActive" class="folder-view">
          <div v-if="!currentFolder.lessons.length" class="empty-folder" role="status">
            <UIcon name="i-lucide-folder-search" />
            <h2>{{ t('library.noLessonsFound') }}</h2>
            <p>{{ t('library.emptyFolderHint') }}</p>
            <div class="empty-folder-actions">
              <UButton color="primary" icon="i-lucide-folder-open" :label="t('library.chooseAnotherFolder')" @click="library.openFolder" />
              <UButton v-if="capabilities.revealFolder" color="neutral" icon="i-lucide-folder-search" :label="t('library.showInFolder')" variant="ghost" @click="revealFolder(currentFolder.rootPath)" />
            </div>
          </div>

          <div v-if="currentFolder.lessons.length" class="folder-layout" :class="{ 'folder-layout-theater': isTheaterMode }">
            <div class="player-column">
              <div class="folder-title-row">
                <h1 :title="currentFolder.rootPath">{{ currentFolder.name }}</h1>
                <UDropdownMenu :items="folderMenuItems" :content="{align: 'end'}">
                <UButton color="neutral" icon="i-lucide-ellipsis" variant="ghost" size="sm" :aria-label="t('library.folderActions')" :title="t('library.folderActions')" />
                </UDropdownMenu>
              </div>
              <div
                ref="playerStageRef"
                class="player-stage"
                :class="{
                  'player-stage-window-fullscreen': isImmersive,
                  'player-stage-with-playlist': isImmersive && isImmersivePlaylistOpen,
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
                    <span>{{ t('library.audioLesson') }}</span>
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
                    <UButton :label="t('player.tryAgain')" color="primary" @click="retryPlayback" />
                    <UButton v-if="capabilities.openMediaExternally" :label="t('player.openDefaultApp')" color="neutral" variant="soft" @click="openMediaExternally" />
                  </div>
                </div>
                <div v-else-if="isBuffering" class="buffering-indicator" role="status" :aria-label="t('player.buffering')"><UIcon class="spin" name="i-lucide-loader-circle" /></div>

                <div class="player-topline">
                  <div class="player-view-controls">
                    <button class="player-icon-button" type="button" :aria-expanded="isSidePlaylistVisible" :aria-label="playlistToggleLabel" :title="`${playlistToggleLabel} (T)`" @click="togglePlaylistPanel"><UIcon :name="isSidePlaylistVisible ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'" /></button>
                    <button v-if="!isFullscreen" class="player-icon-button player-full-window" type="button" :aria-pressed="isFullWindow" :aria-label="isFullWindow ? t('player.fullWindowExit') : t('player.fullWindow')" :title="isFullWindow ? `${t('player.fullWindowExit')} (W)` : `${t('player.fullWindow')} (W)`" @click="toggleFullWindow">
                      <UIcon :name="isFullWindow ? 'i-lucide-shrink' : 'i-lucide-expand'" />
                    </button>
                    <button v-if="currentLesson?.kind === 'video' || isFullscreen" class="player-icon-button" type="button" :aria-label="isFullscreen ? t('player.fullscreenExit') : t('player.fullscreen')" :title="isFullscreen ? `${t('player.fullscreenExit')} (F)` : `${t('player.fullscreen')} (F)`" @click="toggleFullscreen">
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
                    :aria-label="t('player.seek')"
                    :aria-valuetext="t('player.seekValue', {current: formatDuration(currentTime), duration: formatDuration(mediaDuration)})"
                    :disabled="!loadedDuration || Boolean(playbackError)"
                    :value="currentTime"
                    :style="{'--range-fill': `${seekPercent}%`}"
                    @input="setSeek"
                  >
                  <div class="player-control-row">
                    <div class="player-control-group">
                      <button class="play-button" type="button" :aria-label="isPlaying ? t('player.pause') : t('player.play')" :title="isPlaying ? t('player.pauseWithSpace') : t('player.playWithSpace')" @click="togglePlayback">
                        <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" />
                      </button>
                      <button
                        class="player-icon-button"
                        type="button"
                        :title="previousLesson ? t('player.previousLesson', {name: previousLesson.title}) : t('player.previousTrack')"
                        :aria-label="t('player.previousTrack')"
                        :disabled="!hasPreviousLesson"
                        @click="navigateLesson(-1)"
                      >
                        <UIcon name="i-lucide-skip-back" />
                      </button>
                      <button
                        class="player-icon-button"
                        type="button"
                        :title="nextLesson ? t('player.nextLesson', {name: nextLesson.title}) : t('player.nextTrack')"
                        :aria-label="t('player.nextTrack')"
                        :disabled="!hasNextLesson"
                        @click="navigateLesson(1)"
                      >
                        <UIcon name="i-lucide-skip-forward" />
                      </button>
                      <button class="player-icon-button" :title="t('player.backTenSecondsTitle')" :aria-label="t('player.backTenSeconds')" type="button" @click="skip(-10)">
                        <UIcon name="i-lucide-rotate-ccw" />
                        <span class="skip-label">10</span>
                      </button>
                      <button class="player-icon-button" :title="t('player.forwardTenSecondsTitle')" :aria-label="t('player.forwardTenSeconds')" type="button" @click="skip(10)">
                        <UIcon name="i-lucide-rotate-cw" />
                        <span class="skip-label">10</span>
                      </button>
                      <span class="player-time">{{ formatDuration(currentTime) }} / {{ formatDuration(mediaDuration) }}</span>
                    </div>
                    <div class="player-control-group">
                      <button class="player-icon-button player-volume-button" type="button" :aria-label="volume === 0 ? t('player.unmute') : t('player.mute')" :title="volume === 0 ? t('player.unmute') : t('player.mute')" @click="toggleMute">
                        <UIcon class="volume-icon" :name="volumeIcon" />
                      </button>
                      <input class="volume-range" max="1" min="0" step="0.05" type="range" :aria-label="t('player.volume')" :value="volume" :style="{'--range-fill': `${volume * 100}%`}" @input="setVolume">
                      <select class="speed-select" :value="playbackRate" :aria-label="t('player.playbackSpeed')" @change="setPlaybackRate">
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
                  <p class="lesson-kicker">{{ t('library.lessonKicker', {number: formatLessonNumber(currentLesson?.sequence ?? 0)}) }}</p>
                  <h2>{{ currentLesson?.title }}</h2>
                  <p>{{ currentLesson?.relativePath }}</p>
                </div>
                <div class="lesson-heading-actions">
                  <UButton
                    :color="currentLesson && isLessonComplete(currentLesson) ? 'success' : 'neutral'"
                    :icon="currentLesson && isLessonComplete(currentLesson) ? 'i-lucide-check' : 'i-lucide-circle-check'"
                    :label="currentLesson && isLessonComplete(currentLesson) ? t('library.completed') : t('library.markComplete')"
                    variant="soft"
                    @click="currentLesson && library.toggleComplete(currentLesson)"
                  />
                  <UButton v-if="currentLesson && hasLessonProgress(currentLesson)" color="error" icon="i-lucide-rotate-ccw" :label="t('player.resetProgress')" variant="ghost" @click="requestLessonProgressReset(currentLesson)" />
                </div>
              </div>
            </div>

            <aside class="playlist-panel" :class="{ 'playlist-panel-immersive': isImmersive && isImmersivePlaylistOpen }">
              <div class="playlist-header">
                <div class="folder-progress" :title="watchedProgressTitle">
                  <span class="folder-progress-bar"><span :style="{width: `${folderProgress}%`}" /></span>
                  <span>{{ formatPercent(folderProgress) }} · {{ formatNumber(watchedCount) }}/{{ formatNumber(currentFolder.lessons.length) }}</span>
                </div>
                <p class="folder-meta">{{ folderMeta }}</p>
              </div>
              <UInput v-model="search" class="playlist-search" icon="i-lucide-search" type="search" :aria-label="t('playlist.searchPlaceholder')" :placeholder="t('playlist.searchPlaceholder')" size="md" />

              <div ref="playlistRef" class="playlist-scroll">
                <div v-if="!filteredLessons.length" class="playlist-empty">
                  <UIcon name="i-lucide-search-x" />
                  <span>{{ t('playlist.noMatches') }}</span>
                </div>
                <div v-for="group in lessonGroups" :key="group.section" class="lesson-group">
                  <div v-if="lessonGroups.length > 1" class="section-heading">{{ group.section }}</div>
                  <div
                    v-for="lesson in group.lessons"
                    :key="lesson.id"
                    class="lesson-row"
                    :class="{ 'lesson-row-active': currentLesson?.id === lesson.id }"
                  >
                    <button
                      class="lesson-row-done"
                      type="button"
                      :aria-pressed="isLessonComplete(lesson)"
                      :aria-label="isLessonComplete(lesson) ? t('library.markLessonIncomplete', {name: lesson.title}) : t('library.markLessonComplete', {name: lesson.title})"
                      :title="isLessonComplete(lesson) ? t('library.markAsIncomplete') : t('library.markAsComplete')"
                      @click="library.toggleComplete(lesson)"
                    >
                      <UIcon v-if="isLessonComplete(lesson)" class="lesson-row-done-idle lesson-row-done-check" name="i-lucide-check" />
                      <span v-else class="lesson-row-done-idle">{{ String(lesson.sequence).padStart(2, '0') }}</span>
                      <UIcon class="lesson-row-done-hover" :name="isLessonComplete(lesson) ? 'i-lucide-x' : 'i-lucide-circle-check'" />
                    </button>
                    <button class="lesson-row-select" type="button" :aria-current="currentLesson?.id === lesson.id ? 'true' : undefined" :title="lesson.relativePath" @click="handleLessonRowClick(lesson)">
                      <span class="lesson-row-copy">
                        <strong>{{ lesson.title }}</strong>
                        <small>{{ lesson.kind === 'audio' ? `${t('playlist.audio')} · ` : '' }}{{ formatDuration(library.lessonProgress(currentFolder.id, lesson.id)?.duration || lesson.duration) }}</small>
                        <span class="lesson-row-progress" :class="{ 'lesson-row-progress-empty': !progressForLesson(lesson) }"><span :style="{width: `${progressForLesson(lesson)}%`}" /></span>
                      </span>
                      <template v-if="currentLesson?.id === lesson.id">
                        <template v-if="isPlaying">
                          <UIcon class="lesson-row-playing lesson-row-playing-idle" name="i-lucide-volume-2" :aria-label="t('library.playing')" />
                          <UIcon class="lesson-row-playing lesson-row-playing-hover" name="i-lucide-pause" :aria-label="t('player.pause')" />
                        </template>
                        <UIcon v-else class="lesson-row-playing" name="i-lucide-play" :aria-label="t('player.play')" />
                      </template>
                    </button>
                    <button v-if="hasLessonProgress(lesson)" class="lesson-row-reset" type="button" :aria-label="t('library.resetLessonProgress', {name: lesson.title})" :title="t('library.resetLessonProgress', {name: lesson.title})" @click="requestLessonProgressReset(lesson)">
                      <UIcon name="i-lucide-rotate-ccw" />
                    </button>
                    <span v-else class="lesson-row-reset-space" />
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
        <p class="progress-reset-dialog-copy">{{ t('reset.body') }}</p>
      </template>
      <template #footer>
        <UButton color="neutral" :label="t('reset.cancel')" variant="ghost" :disabled="isResettingProgress" @click="cancelProgressReset" />
        <UButton color="error" icon="i-lucide-rotate-ccw" :label="t('reset.reset')" :loading="isResettingProgress" @click="confirmProgressReset" />
      </template>
    </UModal>

    <UModal v-model:open="isShortcutsOpen" :title="t('shortcuts.title')" :description="t('shortcuts.description')">
      <template #body>
        <dl class="shortcut-list">
          <div><dt>{{ t('shortcuts.playPause') }}</dt><dd>{{ t('shortcuts.keyPlayPause') }}</dd></div>
          <div><dt>{{ t('shortcuts.seekTen') }}</dt><dd>{{ t('shortcuts.keySeekTen') }}</dd></div>
          <div><dt>{{ t('shortcuts.seekFive') }}</dt><dd>{{ t('shortcuts.keySeekFive') }}</dd></div>
          <div><dt>{{ t('shortcuts.volumeMute') }}</dt><dd>{{ t('shortcuts.keyVolumeMute') }}</dd></div>
          <div><dt>{{ t('shortcuts.fullscreenTheater') }}</dt><dd>{{ t('shortcuts.keyFullscreenTheater') }}</dd></div>
          <div><dt>{{ t('shortcuts.fullWindow') }}</dt><dd>{{ t('shortcuts.keyFullWindow') }}</dd></div>
          <div><dt>{{ t('shortcuts.previousNext') }}</dt><dd>{{ t('shortcuts.keyPreviousNext') }}</dd></div>
          <div><dt>{{ t('shortcuts.seekRange') }}</dt><dd>{{ t('shortcuts.keySeekRange') }}</dd></div>
          <div><dt>{{ t('shortcuts.speed') }}</dt><dd>{{ t('shortcuts.keySpeed') }}</dd></div>
          <div><dt>{{ t('shortcuts.frames') }}</dt><dd>{{ t('shortcuts.keyFrames') }}</dd></div>
        </dl>
      </template>
    </UModal>

    <UpdateDialog
      v-if="capabilities.updates"
      :open="isUpdateDialogOpen"
      :status="updateStatus"
      @update:open="setUpdateDialogOpen"
      @download="downloadUpdate"
      @install="installUpdate"
      @retry="checkForUpdates"
      @skip="skipUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import {useDebounceFn, useResizeObserver, useStorage} from '@vueuse/core';
import {nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import type {IMediaLesson, IPlayerApi, IPlayerCapabilities, IRecentFolder, IUpdateStatus, TLocale, TMenuAction, TTheme} from '../../shared/types';
import LanguageMenu from '../../shared/ui/LanguageMenu.vue';
import ThemeToggle from '../../shared/ui/ThemeToggle.vue';
import {useLibrary} from '../composables/useLibrary';
import {useActiveTheme} from '../composables/useActiveTheme';
import {getPlayerApi} from '../utils/playerApi';

type TProgressResetRequest = {
  scope: 'lesson' | 'folder';
  folderId: string;
  lessonId?: string;
  lessonTitle?: string;
};

interface IPlaybackSession {
  folderId: string;
  lessonId: string;
  media: HTMLMediaElement;
  ready: boolean;
}

const library = useLibrary();
const toast = useToast();
const {t, locale} = useI18n();
const {theme: activeTheme, chooseTheme} = useActiveTheme();
const activeLocale = computed(() => locale.value as TLocale);
const capabilities = ref<IPlayerCapabilities>({revealFolder: false, openMediaExternally: false, updates: false});
const recentFolders = library.recentFolders;
const openFolders = library.openFolders;
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
const volume = useStorage('evb-player-volume', 1);
const lastVolume = useStorage('evb-player-last-volume', 1);
const playbackRate = useStorage('evb-player-playback-rate', 1);
volume.value = Number.isFinite(volume.value) ? Math.max(0, Math.min(1, volume.value)) : 1;
lastVolume.value = Number.isFinite(lastVolume.value) && lastVolume.value > 0 ? Math.min(1, lastVolume.value) : 1;
playbackRate.value = [0.75, 1, 1.25, 1.5, 2].includes(playbackRate.value) ? playbackRate.value : 1;
const playbackError = ref('');
const isBuffering = ref(false);
const isShortcutsOpen = ref(false);
const isFullscreen = ref(false);
const isTheaterMode = ref(false);
const isFullWindow = ref(false);
// Full window and fullscreen hide the playlist; the playlist button can show it beside the video.
const isImmersive = computed(() => isFullscreen.value || isFullWindow.value);
const isImmersivePlaylistOpen = ref(false);
const isSidePlaylistVisible = computed(() => isImmersive.value ? isImmersivePlaylistOpen.value : !isTheaterMode.value);
const playlistToggleLabel = computed(() => {
  if (isImmersive.value) {
    return isImmersivePlaylistOpen.value ? t('player.playlistHide') : t('player.playlistShow');
  }
  return isTheaterMode.value ? t('player.theaterExit') : t('player.theater');
});
const areControlsVisible = ref(true);
const isPlayerFocused = ref(false);
const autoplayLessonId = ref<string | null>(null);
const progressResetRequest = ref<TProgressResetRequest | null>(null);
const isProgressResetDialogOpen = ref(false);
const isResettingProgress = ref(false);
const isRetryingProgress = ref(false);
let controlsHideTimer: ReturnType<typeof setTimeout> | null = null;
let removeWindowFullscreenListener: (() => void) | null = null;
let removeMenuActionListener: (() => void) | null = null;
let removeUpdateListener: (() => void) | null = null;
let playerApi: IPlayerApi | null = null;
let updateStatusEventCount = 0;
let isPointerInteraction = false;
let lessonLoadRequest = 0;
let progressPersistenceGeneration = 0;
let isProgressPersistenceSuspended = false;
let playbackSession: IPlaybackSession | null = null;
const updateStatus = ref<IUpdateStatus>({phase: 'idle', currentVersion: '', manual: false, requiresPassword: false});
const isUpdateDialogOpen = ref(false);
const dismissedUpdateDialogs = new Set<string>();
let deferredUpdateDialog: string | null = null;

const currentFolder = library.playbackFolder;
const currentLesson = library.playbackLesson;
const isLibraryActive = computed(() => activeTab.value === 'library');
const numberFormat = computed(() => new Intl.NumberFormat(locale.value));

const filteredLessons = computed(() => {
  const folder = currentFolder.value;
  const query = search.value.trim().toLocaleLowerCase();
  if (!folder) {
    return [];
  }
  if (!query) {
    return folder.lessons;
  }
  return folder.lessons.filter((lesson) => `${lesson.title} ${lesson.fileName} ${lesson.relativePath}`.toLocaleLowerCase().includes(query));
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
  const folder = currentFolder.value;
  if (!folder) {
    return 0;
  }
  const progress = library.progressFor(folder.id);
  return folder.lessons.filter((lesson) => progress[lesson.id]?.completed).length;
});
const watchedProgressTitle = computed(() => {
  const total = currentFolder.value?.lessons.length ?? 0;
  return t('counts.watched', {
    count: formatNumber(watchedCount.value),
    total: formatNumber(total),
  }, total);
});

const folderProgress = computed(() => currentFolder.value ? library.progressPercent(currentFolder.value) : 0);
const mediaDuration = computed(() => loadedDuration.value || currentLesson.value?.duration || 0);
const seekPercent = computed(() => mediaDuration.value ? Math.min(100, currentTime.value / mediaDuration.value * 100) : 0);
const volumeIcon = computed(() => volume.value === 0 ? 'i-lucide-volume-x' : volume.value < 0.5 ? 'i-lucide-volume-1' : 'i-lucide-volume-2');
const currentProgress = computed(() => {
  const folder = currentFolder.value;
  const lesson = currentLesson.value;
  return folder && lesson ? library.lessonProgress(folder.id, lesson.id) : null;
});

const persistCurrentPosition = useDebounceFn((generation: number) => {
  if (generation !== progressPersistenceGeneration || isProgressPersistenceSuspended) {
    return;
  }
  void saveCurrentProgress();
}, 900, {maxWait: 1500});

const visibleFolderTabs = computed(() => openFolders.value);
const currentLessonIndex = computed(() => {
  const folder = currentFolder.value;
  const lesson = currentLesson.value;
  return folder && lesson ? folder.lessons.findIndex((candidate) => candidate.id === lesson.id) : -1;
});
const hasPreviousLesson = computed(() => currentLessonIndex.value > 0);
const hasNextLesson = computed(() => {
  const folder = currentFolder.value;
  return Boolean(folder && currentLessonIndex.value >= 0 && currentLessonIndex.value < folder.lessons.length - 1);
});
const previousLesson = computed(() => currentFolder.value?.lessons[currentLessonIndex.value - 1]);
const nextLesson = computed(() => currentFolder.value?.lessons[currentLessonIndex.value + 1]);
const continueLabel = computed(() => folderProgress.value === 100 ? t('library.watchAgain') : watchedCount.value || currentProgress.value?.position ? t('library.continue') : t('library.start'));
const folderMeta = computed(() => {
  const folder = currentFolder.value;
  if (!folder) {
    return '';
  }
  const parts = [t('counts.position', {
    current: formatNumber(currentLessonIndex.value + 1),
    total: formatNumber(folder.lessons.length),
  })];
  if (folder.audioCount && folder.videoCount) {
    parts.push(`${t('counts.video', {count: formatNumber(folder.videoCount)}, folder.videoCount)}, ${t('counts.audio', {count: formatNumber(folder.audioCount)}, folder.audioCount)}`);
  }
  if (folder.totalDuration) {
    parts.push(formatFolderDuration(folder.totalDuration));
  }
  parts.push(formatBytes(folder.totalBytes));
  // Keep localized number and unit groups together while allowing breaks between summary parts.
  return parts.map((part) => part.replaceAll(' ', '\u00a0')).join(' · ');
});
const folderMenuItems = computed(() => {
  const folder = currentFolder.value;
  if (!folder) {
    return [];
  }
  return [
    [
      {label: continueLabel.value, icon: 'i-lucide-play', disabled: !currentLesson.value, onSelect: resumeCurrentFolder},
      ...(capabilities.value.revealFolder ? [{label: t('library.showInFolder'), icon: 'i-lucide-folder-search', onSelect: () => revealFolder(folder.rootPath)}] : []),
    ],
    [
      {label: t('reset.folderMenu'), icon: 'i-lucide-rotate-ccw', color: 'error' as const, onSelect: requestFolderProgressReset},
    ],
  ];
});
const progressResetTitle = computed(() => progressResetRequest.value?.scope === 'folder' ? t('reset.folderTitle') : t('reset.lessonTitle'));
const progressResetDescription = computed(() => {
  const request = progressResetRequest.value;
  if (!request) {
    return '';
  }
  if (request.scope === 'folder') {
    return t('reset.folderDescription');
  }
  return t('reset.lessonDescription', {name: request.lessonTitle});
});

function formatNumber(value: number) {
  return numberFormat.value.format(value);
}

function formatLessonCount(count: number) {
  return t('counts.lesson', {count: formatNumber(count)}, count);
}

function formatLessonNumber(value: number) {
  return new Intl.NumberFormat(locale.value, {minimumIntegerDigits: 2, useGrouping: false}).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(locale.value, {style: 'percent', maximumFractionDigits: 0}).format(value / 100);
}

function formatUnit(value: number, unit: 'hour' | 'minute') {
  return new Intl.NumberFormat(locale.value, {style: 'unit', unit, unitDisplay: 'short'}).format(value);
}

async function selectTheme(theme: TTheme) {
  chooseTheme(theme);
  try {
    await (await getPlayerApi()).setTheme(theme);
  } catch {
    toast.add({title: t('settings.themeSaveFailed'), color: 'error'});
  }
}

async function selectLocale(nextLocale: TLocale) {
  locale.value = nextLocale;
  try {
    await (await getPlayerApi()).setLocale(nextLocale);
  } catch {
    toast.add({title: t('settings.languageSaveFailed'), color: 'error'});
  }
}

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

function formatFolderDuration(seconds: number) {
  if (!seconds) {
    return '—';
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) {
    parts.push(formatUnit(hours, 'hour'));
  }
  if (minutes > 0 || hours === 0) {
    parts.push(formatUnit(minutes, 'minute'));
  }
  return parts.join(' ');
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 3) {
    return new Intl.NumberFormat(locale.value, {style: 'unit', unit: 'megabyte', unitDisplay: 'short', maximumFractionDigits: 0}).format(bytes / 1024 ** 2);
  }
  return new Intl.NumberFormat(locale.value, {style: 'unit', unit: 'gigabyte', unitDisplay: 'short', maximumFractionDigits: 1}).format(bytes / 1024 ** 3);
}

function progressForLesson(lesson: IMediaLesson) {
  const folder = currentFolder.value;
  if (!folder) {
    return 0;
  }
  const progress = library.lessonProgress(folder.id, lesson.id);
  const duration = progress?.duration || lesson.duration || 0;
  if (progress?.completed) {
    return 100;
  }
  return duration > 0 ? Math.min(100, Math.round((progress?.position ?? 0) / duration * 100)) : 0;
}

function isLessonComplete(lesson: IMediaLesson) {
  const folder = currentFolder.value;
  return Boolean(folder && library.lessonProgress(folder.id, lesson.id)?.completed);
}

function hasLessonProgress(lesson: IMediaLesson) {
  const folder = currentFolder.value;
  const progress = folder ? library.lessonProgress(folder.id, lesson.id) : null;
  return Boolean(progress && (progress.completed || progress.position > 0));
}

function requestLessonProgressReset(lesson: IMediaLesson) {
  const folder = currentFolder.value;
  if (!folder) {
    return;
  }
  progressResetRequest.value = {
    scope: 'lesson',
    folderId: folder.id,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
  };
  isProgressResetDialogOpen.value = true;
  if (lesson.id === currentLesson.value?.id) {
    mediaRef.value?.pause();
  }
}

function requestFolderProgressReset() {
  const folder = currentFolder.value;
  if (!folder) {
    return;
  }
  progressResetRequest.value = {
    scope: 'folder',
    folderId: folder.id,
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
  const isCurrentFolder = currentFolder.value?.id === request.folderId;
  const resetsCurrentLesson = request.scope === 'folder' || request.lessonId === currentLesson.value?.id;
  const resetMedia = resetsCurrentLesson && isCurrentFolder ? mediaRef.value : null;
  const previousPosition = resetMedia?.currentTime ?? 0;
  if (resetsCurrentLesson && isCurrentFolder) {
    progressPersistenceGeneration += 1;
    isProgressPersistenceSuspended = true;
  }
  try {
    if (request.scope === 'folder') {
      if (isCurrentFolder) {
        resetCurrentMedia();
      }
      await library.clearFolderProgress(request.folderId);
      toast.add({
        title: t('reset.folderSuccessTitle'),
        description: t('reset.folderSuccessDescription'),
        color: 'success',
        icon: 'i-lucide-rotate-ccw',
      });
    } else if (request.lessonId) {
      if (isCurrentFolder && request.lessonId === currentLesson.value?.id) {
        resetCurrentMedia();
      }
      await library.clearLessonProgress(request.folderId, request.lessonId);
      toast.add({
        title: t('reset.lessonSuccessTitle'),
        description: t('reset.lessonSuccessDescription', {name: request.lessonTitle}),
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
      title: t('reset.failedTitle'),
      description: t('reset.failedDescription'),
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
        if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
          playbackError.value = t('player.playbackStartPrompt');
        } else {
          playbackError.value = capabilities.value.openMediaExternally ? t('player.playbackFailed') : t('player.cannotPlayInBrowser');
        }
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

function resumeCurrentFolder() {
  const folder = currentFolder.value;
  if (!folder) {
    return;
  }
  const lesson = library.findResumeLesson(folder);
  if (lesson) {
    selectLesson(lesson);
  }
}

function navigateLesson(direction: 1 | -1) {
  const folder = currentFolder.value;
  const lesson = currentLesson.value;
  if (!folder || !lesson) {
    return;
  }
  const index = folder.lessons.findIndex((candidate) => candidate.id === lesson.id);
  const nextLesson = folder.lessons[index + direction];
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

function togglePlaylistPanel() {
  if (!isImmersive.value) {
    toggleTheaterMode();
    return;
  }
  isImmersivePlaylistOpen.value = !isImmersivePlaylistOpen.value;
  showPlayerControls();
}

function toggleFullWindow() {
  if (isLibraryActive.value && !isFullWindow.value) return;
  isFullWindow.value = !isFullWindow.value;
  showPlayerControls();
}

async function toggleFullscreen() {
  if (isLibraryActive.value && !isFullscreen.value) return;
  if (currentLesson.value?.kind !== 'video' && !isFullscreen.value) {
    return;
  }

  try {
    const api = await getPlayerApi();
    isFullscreen.value = await api.setWindowFullscreen(!isFullscreen.value);
  } catch {
    toast.add({title: t('player.fullscreenUnavailable'), color: 'error'});
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
  const previous = library.lessonProgress(session.folderId, session.lessonId);
  await library.saveProgress(session.folderId, session.lessonId, {
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
  const folder = currentFolder.value;
  const lesson = currentLesson.value;
  const lessonIndex = folder && lesson ? folder.lessons.findIndex((candidate) => candidate.id === lesson.id) : -1;
  const nextLesson = folder && lessonIndex >= 0 ? folder.lessons[lessonIndex + 1] : null;
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
  document.documentElement.classList.toggle('evb-player-fullscreen', fullscreen);
  document.body.classList.toggle('evb-player-fullscreen', fullscreen);
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
    togglePlaylistPanel();
  } else if (isKey('w')) {
    toggleFullWindow();
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
  } else if (isEscape && isFullWindow.value) {
    toggleFullWindow();
  } else {
    handled = false;
  }

  if (handled) {
    event.preventDefault();
    showPlayerControls();
  }
}

watch([() => currentFolder.value?.id, () => currentLesson.value?.id], async ([folderId, lessonId]) => {
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
      void getPlayerApi().then((api) => api.setWindowFullscreen(false)).catch(() => undefined);
      isFullscreen.value = false;
    }
    isFullWindow.value = false;
    return;
  }
  if (!folderId || !lessonId) {
    return;
  }
  playbackSession = {folderId, lessonId, media, ready: false};
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
  playbackError.value = capabilities.value.openMediaExternally ? t('player.mediaUnavailable') : t('player.cannotPlayInBrowser');
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
  if (!currentLesson.value || !capabilities.value.openMediaExternally) return;
  try {
    await (await getPlayerApi()).openMediaExternally(currentLesson.value.mediaUrl);
  } catch {
    toast.add({title: t('player.openFileFailed'), description: t('player.checkFolderAvailable'), color: 'error'});
  }
}

async function revealFolder(rootPath: string) {
  if (!capabilities.value.revealFolder) return;
  try {
    await (await getPlayerApi()).revealFolder(rootPath);
  } catch (cause) {
    toast.add({title: t('player.showFolderFailed'), description: cause instanceof Error ? cause.message : t('player.checkFolderAvailable'), color: 'error'});
  }
}

async function removeFolder(folder: IRecentFolder) {
  await library.removeRecentFolder(folder);
  if (!recentFolders.value.some((candidate) => candidate.id === folder.id)) {
    toast.add({title: t('library.folderRemoved'), description: t('library.folderRemovedDescription'), actions: [{label: t('library.undo'), onClick: () => library.openRecentFolder(folder)}]});
  }
}

async function closeFolder(folderId: string) {
  library.closeFolder(folderId);
  await nextTick();
  document.querySelector<HTMLButtonElement>('.tab-strip [aria-current="page"]')?.focus();
}

function saveBeforeLeaving() {
  void saveCurrentProgress();
}

async function retryProgressWrites() {
  isRetryingProgress.value = true;
  const session = playbackSession;
  const previousProgress = session && library.lessonProgress(session.folderId, session.lessonId);
  try {
    await library.retryProgressWrites();
    if (session && session === playbackSession && previousProgress && !library.lessonProgress(session.folderId, session.lessonId)) {
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

watch(() => currentFolder.value?.id, () => {search.value = '';});
watch(isPlaying, (playing) => {
  if (playing || !deferredUpdateDialog) {
    return;
  }
  const status = updateStatus.value;
  const key = updateDialogKey(status);
  if (deferredUpdateDialog === key && !dismissedUpdateDialogs.has(key)) {
    isUpdateDialogOpen.value = true;
  }
  deferredUpdateDialog = null;
});
watch(isLibraryActive, (libraryActive) => {if (libraryActive) isFullWindow.value = false;});
// Each full window or fullscreen session starts with only the video.
watch(isImmersive, (immersive) => {if (!immersive) isImmersivePlaylistOpen.value = false;});
watch(search, async () => {if (!search.value) {await nextTick(); revealCurrentLesson();}});

watch(() => isFullscreen.value || isFullWindow.value, syncFullscreenDocumentClass);

function updateDialogKey(status: IUpdateStatus) {
  return `${status.version ?? ''}:${status.phase}`;
}

function considerUpdateDialog(status: IUpdateStatus) {
  if (!capabilities.value.updates) {
    return;
  }
  if (status.manual && status.phase !== 'idle') {
    deferredUpdateDialog = null;
    isUpdateDialogOpen.value = true;
    return;
  }
  if (status.phase !== 'available' && status.phase !== 'ready') {
    deferredUpdateDialog = null;
    return;
  }

  const key = updateDialogKey(status);
  if (dismissedUpdateDialogs.has(key)) {
    deferredUpdateDialog = null;
    return;
  }
  deferredUpdateDialog = key;
  if (!isPlaying.value) {
    deferredUpdateDialog = null;
    isUpdateDialogOpen.value = true;
  }
}

function receiveUpdateStatus(status: IUpdateStatus) {
  updateStatusEventCount += 1;
  updateStatus.value = status;
  considerUpdateDialog(status);
}

function setUpdateDialogOpen(open: boolean) {
  if (!open) {
    const status = updateStatus.value;
    const key = updateDialogKey(status);
    dismissedUpdateDialogs.add(key);
    if (deferredUpdateDialog === key) {
      deferredUpdateDialog = null;
    }
  }
  isUpdateDialogOpen.value = open;
}

function handleMenuAction(action: TMenuAction) {
  if (action === 'add-folder') {
    void library.openFolder();
  } else if (action === 'keyboard-shortcuts') {
    isShortcutsOpen.value = true;
  } else {
    isUpdateDialogOpen.value = true;
    void playerApi?.checkForUpdates().catch(() => undefined);
  }
}

function checkForUpdates() {
  isUpdateDialogOpen.value = true;
  void playerApi?.checkForUpdates().catch(() => undefined);
}

function downloadUpdate() {
  void playerApi?.downloadUpdate().catch(() => undefined);
}

function installUpdate() {
  void playerApi?.installUpdate().catch(() => undefined);
}

async function skipUpdate() {
  const version = updateStatus.value.version;
  if (!version || !playerApi) {
    return;
  }
  try {
    await playerApi.skipUpdate(version);
    isUpdateDialogOpen.value = false;
  } catch {
    // The status remains available so the user can try skipping again.
  }
}

onMounted(async () => {
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('keydown', handleKeyboard);
  window.addEventListener('pagehide', saveBeforeLeaving);
  window.addEventListener('beforeunload', saveBeforeLeaving);
  if (import.meta.client) {
    try {
      const api = await getPlayerApi();
      playerApi = api;
      capabilities.value = api.capabilities;
      removeMenuActionListener = api.onMenuAction(handleMenuAction);
      removeWindowFullscreenListener = api.onWindowFullscreenChanged((fullscreen) => {
        isFullscreen.value = fullscreen;
      });
      if (api.capabilities.updates) {
        removeUpdateListener = api.onUpdateStatus(receiveUpdateStatus);
        const eventCount = updateStatusEventCount;
        const currentStatus = await api.getUpdateStatus();
        if (updateStatusEventCount === eventCount) {
          updateStatus.value = currentStatus;
          considerUpdateDialog(currentStatus);
        }
      }
    } catch {
      // The renderer stays usable if the platform API cannot initialize.
    }
  }
  syncFullscreenDocumentClass(isFullscreen.value || isFullWindow.value);
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
  removeMenuActionListener?.();
  removeMenuActionListener = null;
  removeUpdateListener?.();
  removeUpdateListener = null;
  syncFullscreenDocumentClass(false);
});
</script>
