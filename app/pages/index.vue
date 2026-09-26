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

        <section v-if="isLibraryActive && currentFolder && currentTrack" class="library-player" :aria-label="t('library.currentPlayback')">
          <button class="play-button" type="button" :aria-label="isPlaying ? t('player.pause') : t('player.play')" @click="togglePlayback">
            <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" />
          </button>
          <div class="library-player-copy">
            <span>{{ playbackError ? t('library.playbackUnavailable') : isPlaying ? t('library.nowPlaying') : t('library.paused') }} · {{ currentFolder.name }}</span>
            <strong>{{ currentTrack.title }}</strong>
            <small>{{ formatDuration(currentTime) }} / {{ formatDuration(mediaDuration) }}</small>
          </div>
          <UButton color="neutral" icon="i-lucide-arrow-up-right" :label="t('library.backToPlayer')" variant="soft" @click="library.setActiveTab(currentFolder.id)" />
        </section>

        <section v-if="isLibraryActive && !loading && recentFolders.length" class="library-view">
          <div class="library-heading">
            <div class="library-heading-title">
              <h1>{{ t('library.yourFolders') }}</h1>
              <span class="library-folder-count">{{ formatFolderCount(recentFolders.length) }}</span>
            </div>
            <div class="library-heading-controls">
              <UInput
                v-model="librarySearch"
                class="library-search"
                icon="i-lucide-search"
                :aria-label="t('library.searchFolders')"
                :placeholder="t('library.searchFolders')"
              />
              <div class="library-view-toggle" role="group" :aria-label="t('library.viewOptions')">
                <UTooltip :text="t('library.cardsView')">
                  <button class="library-view-button" type="button" :aria-label="t('library.cardsView')" :aria-pressed="libraryView === 'cards'" @click="libraryView = 'cards'">
                    <UIcon name="i-lucide-layout-grid" />
                  </button>
                </UTooltip>
                <UTooltip :text="t('library.tableView')">
                  <button class="library-view-button" type="button" :aria-label="t('library.tableView')" :aria-pressed="libraryView === 'table'" @click="libraryView = 'table'">
                    <UIcon name="i-lucide-list" />
                  </button>
                </UTooltip>
              </div>
              <UButton color="primary" icon="i-lucide-folder-plus" :label="t('library.addFolder')" @click="library.openFolder" />
            </div>
          </div>

          <div v-if="filteredRecentFolders.length && libraryView === 'cards'" class="folder-grid">
            <article v-for="folder in filteredRecentFolders" :key="folder.id" class="folder-card">
              <button class="folder-card-open" type="button" @click="library.openRecentFolder(folder)">
                <UIcon name="i-lucide-folder" />
                <strong>{{ folder.name }}</strong>
                <span class="folder-card-location" :title="folder.rootPath">{{ folder.rootPath }}</span>
                <small>{{ formatTrackCount(folderTrackCount(folder)) }}</small>
                <span class="folder-card-progress">
                  <span class="folder-progress-bar" role="progressbar" :aria-label="t('library.columnProgress')" :aria-valuenow="folderProgressPercent(folder)" aria-valuemin="0" aria-valuemax="100">
                    <span :style="{width: `${folderProgressPercent(folder)}%`}" />
                  </span>
                  <span>{{ formatPercent(folderProgressPercent(folder)) }}</span>
                </span>
                <small class="folder-card-last-opened">{{ t('library.lastOpenedDate', {date: formatLastOpened(folder.lastOpenedAt)}) }}</small>
              </button>
              <UButton v-if="capabilities.revealFolder" class="folder-card-reveal" color="neutral" icon="i-lucide-folder-search" :label="t('library.showInFolder')" variant="ghost" @click="revealFolder(folder.rootPath)" />
              <UTooltip :text="t('library.removeFolder')">
                <button class="folder-card-remove" type="button" :aria-label="t('library.removeFromCollection', {name: folder.name})" @click="removeFolder(folder)"><UIcon name="i-lucide-x" /></button>
              </UTooltip>
            </article>
          </div>

          <UTable
            v-else-if="filteredRecentFolders.length && libraryView === 'table'"
            class="folder-table"
            :data="folderTableRows"
            :columns="folderTableColumns"
            v-model:sorting="folderTableSorting"
            :onSelect="openFolderTableRow"
            @keydown.enter="handleFolderTableEnter"
          >
            <template v-for="sortable in sortableFolderColumns" #[`${sortable.id}-header`]="{column}">
              <button class="folder-table-sort" type="button" :aria-label="sortLabel(sortable.label, column.getIsSorted())" @click="column.toggleSorting(column.getIsSorted() === 'asc')">
                {{ sortable.label }}
                <UIcon v-if="column.getIsSorted()" :name="column.getIsSorted() === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" />
              </button>
            </template>
            <template #rootPath-header>
              {{ t('library.columnLocation') }}
            </template>
            <template #name-cell="{row}">
              <span class="folder-table-name"><UIcon name="i-lucide-folder" />{{ row.original.name }}</span>
            </template>
            <template #rootPath-cell="{row}">
              <UTooltip :text="row.original.rootPath">
                <span class="folder-table-location" :title="row.original.rootPath">{{ row.original.rootPath }}</span>
              </UTooltip>
            </template>
            <template #mediaCount-cell="{row}">
              {{ formatTrackCount(row.original.mediaCount) }}
            </template>
            <template #completionPercent-cell="{row}">
              <span class="folder-table-progress">
                <span class="folder-progress-bar" role="progressbar" :aria-label="t('library.columnProgress')" :aria-valuenow="row.original.completionPercent" aria-valuemin="0" aria-valuemax="100"><span :style="{width: `${row.original.completionPercent}%`}" /></span>
                <span>{{ formatPercent(row.original.completionPercent) }}</span>
              </span>
            </template>
            <template #lastOpenedAt-cell="{row}">
              {{ formatLastOpened(row.original.lastOpenedAt) }}
            </template>
            <template #actions-header>
              {{ t('library.columnActions') }}
            </template>
            <template #actions-cell="{row}">
              <span class="folder-table-actions">
                <UTooltip v-if="capabilities.revealFolder" :text="t('library.showInFolder')">
                  <button class="folder-table-action" type="button" :aria-label="t('library.showInFolder')" @click="revealFolder(row.original.rootPath)"><UIcon name="i-lucide-folder-search" /></button>
                </UTooltip>
                <UTooltip :text="t('library.removeFolder')">
                  <button class="folder-table-action" type="button" :aria-label="t('library.removeFromCollection', {name: row.original.name})" @click="removeFolder(row.original)"><UIcon name="i-lucide-x" /></button>
                </UTooltip>
              </span>
            </template>
          </UTable>

          <p v-if="!filteredRecentFolders.length" class="library-empty-results" role="status">{{ t('library.noFolderMatches', {query: librarySearch.trim()}) }}</p>
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
          <div v-if="!currentTracks.length && !isEditingPlaylist" class="empty-folder" role="status">
            <div class="folder-title-row">
              <h1>{{ currentFolder.name }}</h1>
              <UDropdownMenu :items="folderMenuItems" :content="{align: 'end'}">
                <UButton color="neutral" icon="i-lucide-ellipsis" variant="ghost" size="sm" :aria-label="t('library.folderActions')" :title="t('library.folderActions')" />
              </UDropdownMenu>
            </div>
            <UIcon name="i-lucide-folder-search" />
            <h2>{{ t('library.noTracksFound') }}</h2>
            <p>{{ t('library.emptyFolderHint') }}</p>
            <div class="empty-folder-actions">
              <UButton color="primary" icon="i-lucide-folder-open" :label="t('library.chooseAnotherFolder')" @click="library.openFolder" />
              <UButton v-if="capabilities.revealFolder" color="neutral" icon="i-lucide-folder-search" :label="t('library.showInFolder')" variant="ghost" @click="revealFolder(currentFolder.rootPath)" />
            </div>
          </div>

          <div v-if="currentTracks.length || isEditingPlaylist" class="folder-layout" :class="{ 'folder-layout-theater': isTheaterMode }">
            <div v-if="currentTracks.length" class="player-column">
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
                  v-if="currentTrack?.kind === 'video'"
                  ref="mediaRef"
                  :key="currentTrack.id"
                  class="media-element"
                  preload="metadata"
                  :src="currentTrack.mediaUrl"
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
                    <span>{{ t('library.audioTrack') }}</span>
                    <strong>{{ currentTrack?.title }}</strong>
                  </div>
                  <audio
                    ref="mediaRef"
                    :key="currentTrack?.id"
                    preload="metadata"
                    :src="currentTrack?.mediaUrl"
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
                    <button v-if="currentTrack?.kind === 'video' || isFullscreen" class="player-icon-button" type="button" :aria-label="isFullscreen ? t('player.fullscreenExit') : t('player.fullscreen')" :title="isFullscreen ? `${t('player.fullscreenExit')} (F)` : `${t('player.fullscreen')} (F)`" @click="toggleFullscreen">
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
                        :title="previousTrack ? t('player.previousTrackWithName', {name: previousTrack.title}) : t('player.previousTrack')"
                        :aria-label="t('player.previousTrack')"
                        :disabled="!hasPreviousTrack"
                        @click="navigateTrack(-1)"
                      >
                        <UIcon name="i-lucide-skip-back" />
                      </button>
                      <button
                        class="player-icon-button"
                        type="button"
                        :title="nextTrack ? t('player.nextTrackWithName', {name: nextTrack.title}) : t('player.nextTrack')"
                        :aria-label="t('player.nextTrack')"
                        :disabled="!hasNextTrack"
                        @click="navigateTrack(1)"
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

              <div class="track-heading">
                <div>
                  <p class="track-kicker">{{ t('library.trackKicker', {number: formatTrackNumber(currentTrack ? displayTrackNumber(currentTrack) : 0)}) }}</p>
                  <h2>{{ currentTrack?.title }}</h2>
                  <p>{{ currentTrack?.relativePath }}</p>
                </div>
                <div class="track-heading-actions">
                  <UButton
                    :color="currentTrack && isTrackComplete(currentTrack) ? 'success' : 'neutral'"
                    :icon="currentTrack && isTrackComplete(currentTrack) ? 'i-lucide-check' : 'i-lucide-circle-check'"
                    :label="currentTrack && isTrackComplete(currentTrack) ? t('library.completed') : t('library.markComplete')"
                    variant="soft"
                    @click="currentTrack && library.toggleComplete(currentTrack)"
                  />
                  <UButton v-if="currentTrack && hasTrackProgress(currentTrack)" color="error" icon="i-lucide-rotate-ccw" :label="t('player.resetProgress')" variant="ghost" @click="requestTrackProgressReset(currentTrack)" />
                </div>
              </div>
            </div>
            <div v-else class="empty-folder empty-folder-editing" role="status">
              <UIcon name="i-lucide-folder-search" />
              <h2>{{ t('library.noTracksFound') }}</h2>
              <p>{{ t('library.emptyFolderHint') }}</p>
            </div>

            <aside class="playlist-panel" :class="{ 'playlist-panel-immersive': isImmersive && isImmersivePlaylistOpen }">
              <div class="playlist-header">
                <div class="folder-progress" :title="watchedProgressTitle">
                  <span class="folder-progress-bar"><span :style="{width: `${folderProgress}%`}" /></span>
                  <span>{{ formatPercent(folderProgress) }} · {{ formatNumber(watchedCount) }}/{{ formatNumber(currentTracks.length) }}</span>
                </div>
                <p class="folder-meta">{{ folderMeta }}</p>
              </div>
              <div v-if="isEditingPlaylist" class="playlist-edit-toolbar">
                <UButton color="neutral" icon="i-lucide-plus" :label="t('playlist.addTracks')" variant="soft" @click="openAddTracksDialog" />
                <UButton color="error" icon="i-lucide-rotate-ccw" variant="ghost" :aria-label="t('playlist.resetToFolder')" :title="t('playlist.resetToFolder')" @click="isPlaylistResetDialogOpen = true" />
                <UButton class="playlist-edit-done" color="primary" :label="t('playlist.doneEditing')" @click="finishPlaylistEditing" />
              </div>
              <div v-else class="playlist-search-row">
                <UInput v-model="search" class="playlist-search" icon="i-lucide-search" type="search" :aria-label="t('playlist.searchPlaceholder')" :placeholder="t('playlist.searchPlaceholder')" size="md" />
                <button v-if="hasFavorites" class="playlist-favorites-toggle" type="button" :aria-label="t('playlist.favoritesOnly')" :title="t('playlist.favoritesOnly')" :aria-pressed="favoritesOnly" @click="favoritesOnly = !favoritesOnly">
                    <UIcon name="i-lucide-star" />
                  </button>
              </div>

              <div ref="playlistRef" class="playlist-scroll">
                <div v-if="!filteredTracks.length" class="playlist-empty">
                  <UIcon :name="isEditingPlaylist ? 'i-lucide-list-x' : 'i-lucide-search-x'" />
                  <span>{{ isEditingPlaylist ? t('playlist.emptyPlaylist') : t('playlist.noMatches') }}</span>
                </div>
                <div v-for="group in trackGroups" :key="group.key" class="track-group">
                  <div v-if="trackGroups.length > 1" class="section-heading">{{ group.section }}</div>
                  <div
                    v-for="track in group.tracks"
                    :key="track.id"
                    class="track-row"
                    :class="{
                      'track-row-active': currentTrack?.id === track.id,
                      'track-row-edit': isEditingPlaylist,
                      'track-row-drop-before': dropTarget?.trackId === track.id && dropTarget.position === 'before',
                      'track-row-drop-after': dropTarget?.trackId === track.id && dropTarget.position === 'after',
                    }"
                    :data-track-id="track.id"
                    @dragover="handlePlaylistDragOver($event, track)"
                    @drop="handlePlaylistDrop($event, track)"
                  >
                    <button
                      v-if="isEditingPlaylist"
                      class="playlist-edit-handle"
                      type="button"
                      draggable="true"
                      :aria-label="t('playlist.moveTrack', {name: track.title})"
                      :title="t('playlist.moveTrack', {name: track.title})"
                      @dragstart="handlePlaylistDragStart($event, track)"
                      @dragend="handlePlaylistDragEnd"
                      @keydown="handlePlaylistHandleKeydown($event, track)"
                    >
                      <UIcon name="i-lucide-grip-vertical" />
                    </button>
                    <span v-if="isEditingPlaylist" class="playlist-edit-number">{{ formatNumber(displayTrackNumber(track)) }}</span>
                    <button
                      v-if="!isEditingPlaylist"
                      class="track-row-done"
                      type="button"
                      :aria-pressed="isTrackComplete(track)"
                      :aria-label="isTrackComplete(track) ? t('library.markTrackIncomplete', {name: track.title}) : t('library.markTrackComplete', {name: track.title})"
                      :title="isTrackComplete(track) ? t('library.markAsIncomplete') : t('library.markAsComplete')"
                      @click="library.toggleComplete(track)"
                    >
                      <UIcon v-if="isTrackComplete(track)" class="track-row-done-idle track-row-done-check" name="i-lucide-check" />
                      <span v-else class="track-row-done-idle">{{ String(displayTrackNumber(track)).padStart(2, '0') }}</span>
                      <UIcon class="track-row-done-hover" :name="isTrackComplete(track) ? 'i-lucide-x' : 'i-lucide-circle-check'" />
                    </button>
                    <button class="track-row-select" type="button" :aria-current="currentTrack?.id === track.id ? 'true' : undefined" :title="track.relativePath" @click="handleTrackRowClick(track)">
                      <span class="track-row-copy">
                        <span class="track-row-title"><strong>{{ track.title }}</strong><UIcon v-if="!isEditingPlaylist && isFavorite(track)" class="track-row-favorite" name="i-lucide-star" aria-hidden="true" /></span>
                        <small>
                          <span v-if="track.folderId !== currentFolder.id">{{ t('playlist.fromFolder', {name: trackHomeFolderName(track)}) }} · </span>
                          <span v-if="track.kind === 'audio'">{{ t('playlist.audio') }} · </span>
                          {{ formatDuration(library.trackProgress(track.folderId, track.id)?.duration || track.duration) }}
                        </small>
                        <span v-if="!isEditingPlaylist" class="track-row-progress" :class="{ 'track-row-progress-empty': !progressForTrack(track) }"><span :style="{width: `${progressForTrack(track)}%`}" /></span>
                      </span>
                      <template v-if="currentTrack?.id === track.id">
                        <template v-if="isPlaying">
                          <UIcon class="track-row-playing track-row-playing-idle" name="i-lucide-volume-2" :aria-label="t('library.playing')" />
                          <UIcon class="track-row-playing track-row-playing-hover" name="i-lucide-pause" :aria-label="t('player.pause')" />
                        </template>
                        <UIcon v-else class="track-row-playing" name="i-lucide-play" :aria-label="t('player.play')" />
                      </template>
                    </button>
                    <button v-if="isEditingPlaylist" class="playlist-edit-favorite" type="button" :aria-label="isFavorite(track) ? t('playlist.removeFavorite') : t('playlist.addFavorite')" :title="isFavorite(track) ? t('playlist.removeFavorite') : t('playlist.addFavorite')" :aria-pressed="isFavorite(track)" @click="toggleFavorite(track)">
                        <UIcon name="i-lucide-star" />
                      </button>
                    <button v-if="isEditingPlaylist" class="playlist-edit-remove" type="button" :aria-label="t('playlist.removeTrack', {name: track.title})" :title="t('playlist.removeTrack', {name: track.title})" @click="removePlaylistTrackFromFolder(track)">
                        <UIcon name="i-lucide-x" />
                      </button>
                    <button v-if="!isEditingPlaylist && hasTrackProgress(track)" class="track-row-reset" type="button" :aria-label="t('library.resetTrackProgress', {name: track.title})" :title="t('library.resetTrackProgress', {name: track.title})" @click="requestTrackProgressReset(track)">
                      <UIcon name="i-lucide-rotate-ccw" />
                    </button>
                    <span v-else-if="!isEditingPlaylist" class="track-row-reset-space" />
                  </div>
                </div>
              </div>
              <span class="sr-only" aria-live="polite" aria-atomic="true">{{ reorderAnnouncement }}</span>
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

    <UModal v-model:open="isAddTracksDialogOpen" :title="t('playlist.addTracks')" :dismissible="!isLoadingAddTracks && !isAddingTracks" :close="!isLoadingAddTracks && !isAddingTracks">
      <template #body>
        <label class="add-tracks-folder">
          <span>{{ t('playlist.selectFolder') }}</span>
          <select v-model="selectedSourceFolderId" :aria-label="t('playlist.selectFolder')" :disabled="isLoadingAddTracks || isAddingTracks">
            <option v-for="folder in addSourceFolders" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
          </select>
        </label>
        <div v-if="isLoadingAddTracks" class="add-tracks-loading" role="status">{{ t('playlist.loadingTracks') }}</div>
        <div v-else-if="availableAddTracks.length" class="add-tracks-list">
          <label class="add-tracks-option add-tracks-select-all">
            <input type="checkbox" :checked="areAllAddTracksSelected" :indeterminate="someAddTracksSelected" @change="toggleAllAddTracks">
            <span>{{ t('playlist.selectAll') }}</span>
          </label>
          <label v-for="track in availableAddTracks" :key="track.id" class="add-tracks-option">
            <input v-model="selectedAddTrackIds" type="checkbox" :value="track.id">
            <span><strong>{{ track.title }}</strong><small>{{ track.relativePath }}</small></span>
          </label>
        </div>
        <p v-else class="add-tracks-empty">{{ t('playlist.allTracksAdded') }}</p>
      </template>
      <template #footer>
        <UButton color="neutral" :label="t('reset.cancel')" variant="ghost" :disabled="isAddingTracks" @click="isAddTracksDialogOpen = false" />
        <UButton color="primary" icon="i-lucide-plus" :label="addTracksButtonLabel" :loading="isAddingTracks" :disabled="!selectedAddTrackIds.length || isLoadingAddTracks" @click="addSelectedTracks" />
      </template>
    </UModal>

    <UModal v-model:open="isPlaylistResetDialogOpen" :title="t('playlist.resetTitle')" :description="t('playlist.resetDescription')" :dismissible="!isResettingPlaylist" :close="!isResettingPlaylist">
      <template #footer>
        <UButton color="neutral" :label="t('reset.cancel')" variant="ghost" :disabled="isResettingPlaylist" @click="isPlaylistResetDialogOpen = false" />
        <UButton color="error" icon="i-lucide-rotate-ccw" :label="t('playlist.resetToFolder')" :loading="isResettingPlaylist" @click="resetPlaylistToFolder" />
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
import type {TableColumn, TableRow} from '@nuxt/ui';
import type {IMediaTrack, IPlayerApi, IPlayerCapabilities, IPlaylist, IRecentFolder, IRecentFolderSummary, IUpdateStatus, TLocale, TMenuAction, TTheme} from '../../shared/types';
import {addPlaylistTracks, movePlaylistTrack, playlistTracks, removePlaylistTrack as removeTrackFromPlaylist, togglePlaylistFavorite} from '../../shared/playlist';
import LanguageMenu from '../../shared/ui/LanguageMenu.vue';
import ThemeToggle from '../../shared/ui/ThemeToggle.vue';
import {useLibrary} from '../composables/useLibrary';
import {useActiveTheme} from '../composables/useActiveTheme';
import {getPlayerApi} from '../utils/playerApi';

type TProgressResetRequest = {
  scope: 'track' | 'folder';
  folderId: string;
  trackId?: string;
  trackTitle?: string;
};

type TLibraryView = 'cards' | 'table';

interface IFolderLibraryTableRow extends IRecentFolderSummary {
  completionPercent: number;
}

interface IPlaybackSession {
  folderId: string;
  trackId: string;
  media: HTMLMediaElement;
  ready: boolean;
}

interface IAddSourceFolder {
  id: string;
  name: string;
  rootPath: string;
}

const library = useLibrary();
const toast = useToast();
const {t, locale} = useI18n();
const {theme: activeTheme, chooseTheme} = useActiveTheme();
const activeLocale = computed(() => locale.value as TLocale);
const capabilities = ref<IPlayerCapabilities>({revealFolder: false, openMediaExternally: false, updates: false, addFromOtherFolders: false});
const recentFolders = library.recentFolders;
const openFolders = library.openFolders;
const activeTab = library.activeTab;
const loading = library.loading;
const error = library.error;
const search = ref('');
const isEditingPlaylist = ref(false);
const favoritesOnly = ref(false);
const reorderAnnouncement = ref('');
const draggedTrackId = ref<string | null>(null);
const dropTarget = ref<{trackId: string; position: 'before' | 'after'} | null>(null);
const isAddTracksDialogOpen = ref(false);
const selectedSourceFolderId = ref('');
const addTrackCandidates = ref<IMediaTrack[]>([]);
const selectedAddTrackIds = ref<string[]>([]);
const isLoadingAddTracks = ref(false);
const isAddingTracks = ref(false);
const isPlaylistResetDialogOpen = ref(false);
const isResettingPlaylist = ref(false);
const librarySearch = ref('');
const libraryView = useStorage<TLibraryView>('evb-player-library-view', 'cards');
if (libraryView.value !== 'cards' && libraryView.value !== 'table') {
  libraryView.value = 'cards';
}
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
const autoplayTrackId = ref<string | null>(null);
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
let trackLoadRequest = 0;
let progressPersistenceGeneration = 0;
let isProgressPersistenceSuspended = false;
let playbackSession: IPlaybackSession | null = null;
const updateStatus = ref<IUpdateStatus>({phase: 'idle', currentVersion: '', manual: false, requiresPassword: false});
const isUpdateDialogOpen = ref(false);
const dismissedUpdateDialogs = new Set<string>();
let deferredUpdateDialog: string | null = null;

const currentFolder = library.playbackFolder;
const currentTrack = library.playbackTrack;
const currentTracks = computed(() => currentFolder.value ? playlistTracks(currentFolder.value) : []);
const currentTrackPositions = computed(() => currentFolder.value?.playlist?.order ? new Map(currentTracks.value.map((track, index) => [track.id, index + 1])) : null);
const isLibraryActive = computed(() => activeTab.value === 'library');
const numberFormat = computed(() => new Intl.NumberFormat(locale.value));

const filteredRecentFolders = computed(() => {
  const query = librarySearch.value.trim().toLocaleLowerCase(locale.value);
  if (!query) {
    return recentFolders.value;
  }
  return recentFolders.value.filter((folder) => `${folder.name} ${folder.rootPath}`.toLocaleLowerCase(locale.value).includes(query));
});
const folderTableRows = computed<IFolderLibraryTableRow[]>(() => filteredRecentFolders.value.map((folder) => ({
  ...folder,
  mediaCount: folderTrackCount(folder),
  completionPercent: folderProgressPercent(folder),
})));
const folderTableSorting = ref([{id: 'lastOpenedAt', desc: true}]);
const sortableFolderColumns = computed(() => [
  {id: 'name', label: t('library.columnName')},
  {id: 'mediaCount', label: t('library.columnTracks')},
  {id: 'completionPercent', label: t('library.columnProgress')},
  {id: 'lastOpenedAt', label: t('library.columnLastOpened')},
]);
const folderTableColumns = computed<TableColumn<IFolderLibraryTableRow>[]>(() => [
  {
    accessorKey: 'name',
    header: t('library.columnName'),
    meta: {class: {th: 'folder-table-name-column', td: 'folder-table-name-column'}},
  },
  {
    accessorKey: 'rootPath',
    header: t('library.columnLocation'),
    enableSorting: false,
    meta: {class: {th: 'folder-table-location-column', td: 'folder-table-location-column'}},
  },
  {
    accessorKey: 'mediaCount',
    header: t('library.columnTracks'),
    size: 135,
    meta: {class: {th: 'folder-table-tracks-column', td: 'folder-table-tracks-column'}},
  },
  {
    accessorKey: 'completionPercent',
    header: t('library.columnProgress'),
    size: 140,
    meta: {class: {th: 'folder-table-progress-column', td: 'folder-table-progress-column'}},
  },
  {
    accessorKey: 'lastOpenedAt',
    header: t('library.columnLastOpened'),
    size: 175,
    meta: {class: {th: 'folder-table-last-opened-column', td: 'folder-table-last-opened-column'}},
  },
  {
    id: 'actions',
    header: t('library.columnActions'),
    enableSorting: false,
    size: 96,
    meta: {class: {th: 'folder-table-actions-column', td: 'folder-table-actions-column'}},
  },
]);

const hasFavorites = computed(() => Boolean(currentFolder.value?.playlist?.favorites.length));
const filteredTracks = computed(() => {
  const folder = currentFolder.value;
  const query = search.value.trim().toLocaleLowerCase(locale.value);
  if (!folder) {
    return [];
  }
  let tracks = playlistTracks(folder);
  if (!isEditingPlaylist.value) {
    if (favoritesOnly.value) {
      const favorites = new Set(folder.playlist?.favorites ?? []);
      tracks = tracks.filter((track) => favorites.has(track.id));
    }
    if (query) {
      tracks = tracks.filter((track) => `${track.title} ${track.fileName} ${track.relativePath}`.toLocaleLowerCase(locale.value).includes(query));
    }
  }
  return tracks;
});

const trackGroups = computed(() => {
  if (isEditingPlaylist.value) {
    return filteredTracks.value.length ? [{key: 'editing', section: '', tracks: filteredTracks.value}] : [];
  }
  const groups: Array<{key: string; section: string; tracks: IMediaTrack[]}> = [];
  for (const track of filteredTracks.value) {
    const group = groups.at(-1);
    if (group?.section === track.section) {
      group.tracks.push(track);
    } else {
      groups.push({key: `${track.section}-${groups.length}`, section: track.section, tracks: [track]});
    }
  }
  return groups;
});

const watchedCount = computed(() => {
  return currentTracks.value.filter((track) => library.trackProgress(track.folderId, track.id)?.completed).length;
});
const watchedProgressTitle = computed(() => {
  const total = currentTracks.value.length;
  return t('counts.watched', {
    count: formatNumber(watchedCount.value),
    total: formatNumber(total),
  }, total);
});

const folderProgress = computed(() => currentFolder.value ? library.progressPercent(currentFolder.value) : 0);
const mediaDuration = computed(() => loadedDuration.value || currentTrack.value?.duration || 0);
const seekPercent = computed(() => mediaDuration.value ? Math.min(100, currentTime.value / mediaDuration.value * 100) : 0);
const volumeIcon = computed(() => volume.value === 0 ? 'i-lucide-volume-x' : volume.value < 0.5 ? 'i-lucide-volume-1' : 'i-lucide-volume-2');
const currentProgress = computed(() => {
  const folder = currentFolder.value;
  const track = currentTrack.value;
  return folder && track ? library.trackProgress(track.folderId, track.id) : null;
});

const persistCurrentPosition = useDebounceFn((generation: number) => {
  if (generation !== progressPersistenceGeneration || isProgressPersistenceSuspended) {
    return;
  }
  void saveCurrentProgress();
}, 900, {maxWait: 1500});

const visibleFolderTabs = computed(() => openFolders.value);
const currentTrackIndex = computed(() => {
  const track = currentTrack.value;
  return track ? currentTracks.value.findIndex((candidate) => candidate.id === track.id) : -1;
});
const hasPreviousTrack = computed(() => currentTrackIndex.value > 0);
const hasNextTrack = computed(() => {
  const folder = currentFolder.value;
  return Boolean(folder && currentTrackIndex.value >= 0 && currentTrackIndex.value < currentTracks.value.length - 1);
});
const previousTrack = computed(() => currentTracks.value[currentTrackIndex.value - 1]);
const nextTrack = computed(() => currentTracks.value[currentTrackIndex.value + 1]);
const continueLabel = computed(() => folderProgress.value === 100 ? t('library.watchAgain') : watchedCount.value || currentProgress.value?.position ? t('library.continue') : t('library.start'));
const folderMeta = computed(() => {
  const folder = currentFolder.value;
  if (!folder) {
    return '';
  }
  const tracks = currentTracks.value;
  const videoCount = tracks.filter((track) => track.kind === 'video').length;
  const audioCount = tracks.length - videoCount;
  const totalDuration = tracks.reduce((total, track) => total + (track.duration ?? 0), 0);
  const totalBytes = tracks.reduce((total, track) => total + track.bytes, 0);
  const parts = [t('counts.position', {
    current: formatNumber(currentTrackIndex.value + 1),
    total: formatNumber(tracks.length),
  })];
  if (audioCount && videoCount) {
    parts.push(`${t('counts.video', {count: formatNumber(videoCount)}, videoCount)}, ${t('counts.audio', {count: formatNumber(audioCount)}, audioCount)}`);
  }
  if (totalDuration) {
    parts.push(formatFolderDuration(totalDuration));
  }
  parts.push(formatBytes(totalBytes));
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
      {label: continueLabel.value, icon: 'i-lucide-play', disabled: !currentTrack.value, onSelect: resumeCurrentFolder},
      ...(capabilities.value.revealFolder ? [{label: t('library.showInFolder'), icon: 'i-lucide-folder-search', onSelect: () => revealFolder(folder.rootPath)}] : []),
      {label: t('playlist.editPlaylist'), icon: 'i-lucide-list-ordered', onSelect: beginPlaylistEditing},
    ],
    [
      {label: t('reset.folderMenu'), icon: 'i-lucide-rotate-ccw', color: 'error' as const, onSelect: requestFolderProgressReset},
    ],
  ];
});
const addSourceFolders = computed<IAddSourceFolder[]>(() => {
  const folder = currentFolder.value;
  if (!folder) {
    return [];
  }
  const current = {id: folder.id, name: folder.name, rootPath: folder.rootPath};
  return capabilities.value.addFromOtherFolders
    ? [current, ...recentFolders.value.filter((recentFolder) => recentFolder.id !== folder.id).map(({id, name, rootPath}) => ({id, name, rootPath}))]
    : [current];
});
const availableAddTracks = computed(() => {
  const folder = currentFolder.value;
  if (!folder) {
    return [];
  }
  const existingIds = new Set(currentTracks.value.map((track) => track.id));
  return addTrackCandidates.value.filter((track) => !existingIds.has(track.id));
});
const areAllAddTracksSelected = computed(() => availableAddTracks.value.length > 0
  && availableAddTracks.value.every((track) => selectedAddTrackIds.value.includes(track.id)));
const someAddTracksSelected = computed(() => selectedAddTrackIds.value.length > 0 && !areAllAddTracksSelected.value);
const addTracksButtonLabel = computed(() => t('playlist.addSelectedTracks', {
  count: formatNumber(selectedAddTrackIds.value.length),
}, selectedAddTrackIds.value.length));
const progressResetTitle = computed(() => progressResetRequest.value?.scope === 'folder' ? t('reset.folderTitle') : t('reset.trackTitle'));
const progressResetDescription = computed(() => {
  const request = progressResetRequest.value;
  if (!request) {
    return '';
  }
  if (request.scope === 'folder') {
    return t('reset.folderDescription');
  }
  return t('reset.trackDescription', {name: request.trackTitle});
});

function formatNumber(value: number) {
  return numberFormat.value.format(value);
}

function formatTrackCount(count: number) {
  return t('counts.track', {count: formatNumber(count)}, count);
}

function formatFolderCount(count: number) {
  return t('library.folderCount', {count: formatNumber(count)}, count);
}

function beginPlaylistEditing() {
  isEditingPlaylist.value = true;
  favoritesOnly.value = false;
  search.value = '';
}

function finishPlaylistEditing() {
  isEditingPlaylist.value = false;
  dropTarget.value = null;
  draggedTrackId.value = null;
  reorderAnnouncement.value = '';
}

// A custom order numbers tracks by position; the folder's own order keeps the numbers in the file names.
function displayTrackNumber(track: IMediaTrack) {
  return currentTrackPositions.value?.get(track.id) ?? track.sequence;
}

function isFavorite(track: IMediaTrack) {
  return Boolean(currentFolder.value?.playlist?.favorites.includes(track.id));
}

function trackHomeFolderName(track: IMediaTrack) {
  return recentFolders.value.find((folder) => folder.id === track.folderId)?.name ?? track.folderId;
}

async function savePlaylistChange(playlist: IPlaylist | null, addedTracks?: IMediaTrack[]) {
  const folder = currentFolder.value;
  if (!folder) {
    return false;
  }
  try {
    await library.savePlaylist(folder.id, playlist, addedTracks ?? folder.addedTracks);
    return true;
  } catch {
    toast.add({title: t('playlist.saveFailed'), color: 'error', icon: 'i-lucide-save-off'});
    return false;
  }
}

async function toggleFavorite(track: IMediaTrack) {
  const folder = currentFolder.value;
  if (folder) {
    await savePlaylistChange(togglePlaylistFavorite(folder.playlist, track.id));
  }
}

async function removePlaylistTrackFromFolder(track: IMediaTrack) {
  const folder = currentFolder.value;
  if (!folder) {
    return;
  }
  const playlist = removeTrackFromPlaylist(folder, folder.playlist, track);
  const addedTracks = track.folderId === folder.id
    ? folder.addedTracks
    : folder.addedTracks.filter((candidate) => candidate.id !== track.id);
  await savePlaylistChange(playlist, addedTracks);
}

async function movePlaylistTrackTo(track: IMediaTrack, targetIndex: number) {
  const folder = currentFolder.value;
  if (!folder) {
    return;
  }
  const playlist = movePlaylistTrack(folder, folder.playlist, track.id, targetIndex);
  if (playlist === folder.playlist) {
    return;
  }
  if (!await savePlaylistChange(playlist)) {
    return;
  }
  const movedTracks = currentTracks.value;
  const position = movedTracks.findIndex((candidate) => candidate.id === track.id) + 1;
  reorderAnnouncement.value = t('playlist.positionAnnouncement', {
    name: track.title,
    position: formatNumber(position),
    total: formatNumber(movedTracks.length),
  });
  await nextTick();
  playlistRef.value?.querySelector<HTMLButtonElement>(`[data-track-id="${track.id}"] .playlist-edit-handle`)?.focus();
}

function handlePlaylistHandleKeydown(event: KeyboardEvent, track: IMediaTrack) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const index = currentTracks.value.findIndex((candidate) => candidate.id === track.id);
  void movePlaylistTrackTo(track, index + (event.key === 'ArrowUp' ? -1 : 1));
}

function handlePlaylistDragStart(event: DragEvent, track: IMediaTrack) {
  draggedTrackId.value = track.id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', track.id);
  }
}

function handlePlaylistDragOver(event: DragEvent, track: IMediaTrack) {
  if (!isEditingPlaylist.value || !draggedTrackId.value || draggedTrackId.value === track.id) {
    return;
  }
  event.preventDefault();
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dropTarget.value = {trackId: track.id, position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'};
}

function handlePlaylistDrop(event: DragEvent, track: IMediaTrack) {
  if (!isEditingPlaylist.value) {
    return;
  }
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData('text/plain') || draggedTrackId.value;
  const source = currentTracks.value.find((candidate) => candidate.id === sourceId);
  const target = dropTarget.value?.trackId === track.id ? dropTarget.value : null;
  if (source && target) {
    const sourceIndex = currentTracks.value.findIndex((candidate) => candidate.id === source.id);
    const targetIndex = currentTracks.value.findIndex((candidate) => candidate.id === track.id);
    const insertionIndex = targetIndex + (target.position === 'after' ? 1 : 0);
    const destinationIndex = insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex;
    void movePlaylistTrackTo(source, destinationIndex);
  }
  dropTarget.value = null;
  draggedTrackId.value = null;
}

function handlePlaylistDragEnd() {
  dropTarget.value = null;
  draggedTrackId.value = null;
}

function openAddTracksDialog() {
  const folder = currentFolder.value;
  if (!folder) {
    return;
  }
  addTrackCandidates.value = [];
  selectedAddTrackIds.value = [];
  isAddTracksDialogOpen.value = true;
  if (selectedSourceFolderId.value === folder.id) {
    void loadAddTrackCandidates();
  } else {
    selectedSourceFolderId.value = folder.id;
  }
}

async function loadAddTrackCandidates() {
  const folder = currentFolder.value;
  const sourceFolder = addSourceFolders.value.find((candidate) => candidate.id === selectedSourceFolderId.value);
  if (!folder || !sourceFolder) {
    addTrackCandidates.value = [];
    return;
  }
  selectedAddTrackIds.value = [];
  isLoadingAddTracks.value = true;
  try {
    if (sourceFolder.id === folder.id) {
      const included = new Set(currentTracks.value.map((track) => track.id));
      addTrackCandidates.value = folder.tracks.filter((track) => !included.has(track.id));
    } else {
      const tracks = await (await getPlayerApi()).getFolderTracks(sourceFolder.id, folder.id);
      addTrackCandidates.value = tracks.filter((track) => !currentTracks.value.some((currentTrack) => currentTrack.id === track.id));
    }
  } catch {
    addTrackCandidates.value = [];
    toast.add({title: t('playlist.loadTracksFailed'), color: 'error'});
  } finally {
    isLoadingAddTracks.value = false;
  }
}

function toggleAllAddTracks(event: Event) {
  const shouldSelectAll = (event.target as HTMLInputElement).checked;
  selectedAddTrackIds.value = shouldSelectAll ? availableAddTracks.value.map((track) => track.id) : [];
}

async function addSelectedTracks() {
  const folder = currentFolder.value;
  if (!folder) {
    return;
  }
  const selectedIds = new Set(selectedAddTrackIds.value);
  const selectedTracks = availableAddTracks.value.filter((track) => selectedIds.has(track.id));
  if (!selectedTracks.length) {
    return;
  }
  isAddingTracks.value = true;
  try {
    const externalTracks = selectedTracks.filter((track) => track.folderId !== folder.id);
    if (!await library.loadTrackProgress(externalTracks)) {
      return;
    }
    const playlist = addPlaylistTracks(folder, folder.playlist, selectedTracks);
    const knownAddedIds = new Set(folder.addedTracks.map((track) => track.id));
    const addedTracks = [
      ...folder.addedTracks,
      ...externalTracks
        .filter((track) => !knownAddedIds.has(track.id))
        .map((track) => ({...track, section: trackHomeFolderName(track)})),
    ];
    if (await savePlaylistChange(playlist, addedTracks)) {
      isAddTracksDialogOpen.value = false;
      selectedAddTrackIds.value = [];
    }
  } catch {
    toast.add({title: t('playlist.loadTracksFailed'), color: 'error'});
  } finally {
    isAddingTracks.value = false;
  }
}

async function resetPlaylistToFolder() {
  const folder = currentFolder.value;
  if (!folder) {
    return;
  }
  isResettingPlaylist.value = true;
  const selectedTrackId = currentTrack.value?.id;
  try {
    if (!await savePlaylistChange(null, [])) {
      return;
    }
    finishPlaylistEditing();
    isPlaylistResetDialogOpen.value = false;
    const recentFolder = recentFolders.value.find((candidate) => candidate.id === folder.id);
    if (recentFolder) {
      await library.openRecentFolder(recentFolder);
      const selectedTrack = currentTracks.value.find((track) => track.id === selectedTrackId);
      if (selectedTrack && currentTrack.value?.id !== selectedTrack.id) {
        library.selectTrack(selectedTrack);
      }
    }
  } catch {
    toast.add({title: t('playlist.saveFailed'), color: 'error', icon: 'i-lucide-save-off'});
  } finally {
    isResettingPlaylist.value = false;
  }
}

function folderProgressPercent(folder: IRecentFolderSummary) {
  const openFolder = openFolders.value.find((candidate) => candidate.id === folder.id);
  if (openFolder) {
    return library.progressPercent(openFolder);
  }
  return folder.mediaCount > 0 ? Math.round((folder.completedCount / folder.mediaCount) * 100) : 0;
}

function folderTrackCount(folder: IRecentFolderSummary) {
  const openFolder = openFolders.value.find((candidate) => candidate.id === folder.id);
  return openFolder ? playlistTracks(openFolder).length : folder.mediaCount;
}

function formatLastOpened(timestamp: number) {
  if (!timestamp) {
    return '—';
  }
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) {
    return t('library.justNow');
  }
  const relativeTime = new Intl.RelativeTimeFormat(locale.value, {numeric: 'auto'});
  if (elapsed < 60 * 60_000) {
    return relativeTime.format(-Math.floor(elapsed / 60_000), 'minute');
  }
  if (elapsed < 24 * 60 * 60_000) {
    return relativeTime.format(-Math.floor(elapsed / (60 * 60_000)), 'hour');
  }
  if (elapsed < 7 * 24 * 60 * 60_000) {
    return relativeTime.format(-Math.floor(elapsed / (24 * 60 * 60_000)), 'day');
  }
  return new Intl.DateTimeFormat(locale.value, {dateStyle: 'medium'}).format(timestamp);
}

function sortLabel(name: string, sorted: false | 'asc' | 'desc') {
  return sorted ? t('library.sortByDirection', {name, direction: t(sorted === 'asc' ? 'library.ascending' : 'library.descending')}) : t('library.sortBy', {name});
}

function openFolderTableRow(_event: Event, row: TableRow<IFolderLibraryTableRow>) {
  void library.openRecentFolder(row.original);
}

function handleFolderTableEnter(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.closest('button, a')) {
    return;
  }
  const row = target.closest<HTMLTableRowElement>('tr[role="button"]');
  if (!row) {
    return;
  }
  event.preventDefault();
  row.click();
}

function formatTrackNumber(value: number) {
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

function progressForTrack(track: IMediaTrack) {
  const progress = library.trackProgress(track.folderId, track.id);
  const duration = progress?.duration || track.duration || 0;
  if (progress?.completed) {
    return 100;
  }
  return duration > 0 ? Math.min(100, Math.round((progress?.position ?? 0) / duration * 100)) : 0;
}

function isTrackComplete(track: IMediaTrack) {
  return Boolean(library.trackProgress(track.folderId, track.id)?.completed);
}

function hasTrackProgress(track: IMediaTrack) {
  const progress = library.trackProgress(track.folderId, track.id);
  return Boolean(progress && (progress.completed || progress.position > 0));
}

function requestTrackProgressReset(track: IMediaTrack) {
  const folder = currentFolder.value;
  if (!folder) {
    return;
  }
  progressResetRequest.value = {
    scope: 'track',
    folderId: track.folderId,
    trackId: track.id,
    trackTitle: track.title,
  };
  isProgressResetDialogOpen.value = true;
  if (track.id === currentTrack.value?.id) {
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
  const resetsCurrentTrack = request.scope === 'folder' ? isCurrentFolder : request.trackId === currentTrack.value?.id;
  const resetMedia = resetsCurrentTrack ? mediaRef.value : null;
  const previousPosition = resetMedia?.currentTime ?? 0;
  if (resetsCurrentTrack) {
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
    } else if (request.trackId) {
      if (request.trackId === currentTrack.value?.id) {
        resetCurrentMedia();
      }
      await library.clearTrackProgress(request.folderId, request.trackId);
      toast.add({
        title: t('reset.trackSuccessTitle'),
        description: t('reset.trackSuccessDescription', {name: request.trackTitle}),
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

function selectTrack(track: IMediaTrack, autoplay = true) {
  const isCurrentTrack = currentTrack.value?.id === track.id;
  autoplayTrackId.value = autoplay ? track.id : null;
  library.selectTrack(track);
  if (autoplay) {
    isPlayerFocused.value = false;
  }
  if (isCurrentTrack) {
    autoplayTrackId.value = null;
    if (autoplay && mediaRef.value) {
      playMedia(mediaRef.value);
    }
  }
}

function handleTrackRowClick(track: IMediaTrack) {
  if (currentTrack.value?.id === track.id) {
    togglePlayback();
  } else {
    selectTrack(track);
  }
}

function resumeCurrentFolder() {
  const folder = currentFolder.value;
  if (!folder) {
    return;
  }
  const track = library.findResumeTrack(folder);
  if (track) {
    selectTrack(track);
  }
}

function navigateTrack(direction: 1 | -1) {
  const folder = currentFolder.value;
  const track = currentTrack.value;
  if (!folder || !track) {
    return;
  }
  const index = currentTracks.value.findIndex((candidate) => candidate.id === track.id);
  const nextTrack = currentTracks.value[index + direction];
  if (nextTrack) {
    selectTrack(nextTrack);
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
  if (currentTrack.value?.kind !== 'video' && !isFullscreen.value) {
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
  const previous = library.trackProgress(session.folderId, session.trackId);
  await library.saveProgress(session.folderId, session.trackId, {
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
  const track = currentTrack.value;
  const trackIndex = folder && track ? currentTracks.value.findIndex((candidate) => candidate.id === track.id) : -1;
  const nextTrack = folder && trackIndex >= 0 ? currentTracks.value[trackIndex + 1] : null;
  isPlaying.value = false;
  showPlayerControls();
  await saveCurrentProgress(true);
  if (nextTrack && currentTrack.value?.id === track?.id) {
    selectTrack(nextTrack);
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
  if (target instanceof HTMLElement && target.closest('.playlist-edit-handle')) {
    return;
  }
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
  if (!currentTrack.value) {
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
    navigateTrack(1);
  } else if (isKey('p') && event.shiftKey) {
    navigateTrack(-1);
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

watch([() => currentFolder.value?.id, () => currentTrack.value?.id, () => currentTrack.value?.mediaUrl], async ([folderId, trackId]) => {
  const requestId = ++trackLoadRequest;
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
  if (requestId !== trackLoadRequest || currentTrack.value?.id !== trackId) {
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
  if (!folderId || !trackId) {
    return;
  }
  const track = currentTrack.value;
  if (!track) {
    return;
  }
  playbackSession = {folderId: track.folderId, trackId, media, ready: false};
  const shouldAutoplay = autoplayTrackId.value === trackId;
  autoplayTrackId.value = null;
  media.load();
  if (shouldAutoplay) {
    isPlayerFocused.value = false;
    playMedia(media);
  }
  revealCurrentTrack();
}, {immediate: true});

function revealCurrentTrack() {
  const playlist = playlistRef.value;
  const row = playlist?.querySelector<HTMLElement>('[aria-current="true"]');
  if (!playlist || !row) return;
  const panelBounds = playlist.getBoundingClientRect();
  const rowBounds = row.getBoundingClientRect();
  if (rowBounds.top < panelBounds.top) playlist.scrollTop -= Math.ceil(panelBounds.top - rowBounds.top) + 2;
  else if (rowBounds.bottom > panelBounds.bottom) playlist.scrollTop += Math.ceil(rowBounds.bottom - panelBounds.bottom) + 2;
}

useResizeObserver(playlistRef, revealCurrentTrack);

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
  if (!currentTrack.value || !capabilities.value.openMediaExternally) return;
  try {
    await (await getPlayerApi()).openMediaExternally(currentTrack.value.mediaUrl);
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
  const previousProgress = session && library.trackProgress(session.folderId, session.trackId);
  try {
    await library.retryProgressWrites();
    if (session && session === playbackSession && previousProgress && !library.trackProgress(session.folderId, session.trackId)) {
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

watch(() => currentFolder.value?.id, () => {
  search.value = '';
  favoritesOnly.value = false;
  finishPlaylistEditing();
  isAddTracksDialogOpen.value = false;
  isPlaylistResetDialogOpen.value = false;
});
watch(activeTab, (tabId) => {
  if (tabId === 'library') {
    finishPlaylistEditing();
  }
});
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
watch(isLibraryActive, (libraryActive) => {
  if (libraryActive) {
    isFullWindow.value = false;
    void library.refreshRecentFolders();
  }
});
// Each full window or fullscreen session starts with only the video.
watch(isImmersive, (immersive) => {if (!immersive) isImmersivePlaylistOpen.value = false;});
watch(search, async () => {if (!search.value) {await nextTick(); revealCurrentTrack();}});
// A select's change event can run before v-model updates, so the dialog follows the value itself.
watch(selectedSourceFolderId, () => {if (isAddTracksDialogOpen.value) void loadAddTrackCandidates();});

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
