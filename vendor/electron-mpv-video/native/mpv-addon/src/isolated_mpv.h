#pragma once

#ifdef __linux__
#include <dlfcn.h>
#include <link.h>
#include <string>

// Electron exports a different FFmpeg ABI and overrides malloc/free. Deep
// binding only part of that dependency group mixes allocators. Load libmpv's
// complete C dependency group into one namespace and keep all its allocations
// behind the libmpv API. The Node addon itself stays in Electron's namespace.
#define MPV_ISOLATED_FUNCTIONS(X) \
  X(mpv_create) \
  X(mpv_initialize) \
  X(mpv_terminate_destroy) \
  X(mpv_error_string) \
  X(mpv_event_name) \
  X(mpv_set_option_string) \
  X(mpv_observe_property) \
  X(mpv_command_async) \
  X(mpv_set_property_async) \
  X(mpv_set_wakeup_callback) \
  X(mpv_wait_event) \
  X(mpv_render_context_create) \
  X(mpv_render_context_free) \
  X(mpv_render_context_render) \
  X(mpv_render_context_update) \
  X(mpv_render_context_set_update_callback)

struct IsolatedMpvApi {
#define MPV_DECLARE(name) decltype(&::name) name = nullptr;
  MPV_ISOLATED_FUNCTIONS(MPV_DECLARE)
#undef MPV_DECLARE
  void* library = nullptr;
};

static IsolatedMpvApi isolated_mpv;

static std::string load_isolated_mpv() {
  if (isolated_mpv.library) return {};
  Dl_info addon{};
  if (!dladdr(reinterpret_cast<void*>(&load_isolated_mpv), &addon) || !addon.dli_fname) {
    return "Cannot locate the native playback module";
  }
  const std::string filename(addon.dli_fname);
  const auto directory = filename.substr(0, filename.find_last_of('/') + 1);
  void* library = nullptr;
  for (const char* name : {"libmpv.so.2", "libmpv.so.1"}) {
    library = dlmopen(LM_ID_NEWLM, (directory + name).c_str(), RTLD_NOW | RTLD_LOCAL);
    if (library) break;
  }
  if (!library) {
    const char* error = dlerror();
    return std::string("Cannot load the isolated playback runtime: ") + (error ? error : "unknown error");
  }
#define MPV_RESOLVE(name) \
  isolated_mpv.name = reinterpret_cast<decltype(isolated_mpv.name)>(dlsym(library, #name)); \
  if (!isolated_mpv.name) { dlclose(library); return "Missing playback function: " #name; }
  MPV_ISOLATED_FUNCTIONS(MPV_RESOLVE)
#undef MPV_RESOLVE
  // Remain loaded until process exit. Sessions and callbacks may span renderer
  // reloads, and reusing one namespace also avoids exhausting glibc TLS slots.
  isolated_mpv.library = library;
  return {};
}

#define mpv_create isolated_mpv.mpv_create
#define mpv_initialize isolated_mpv.mpv_initialize
#define mpv_terminate_destroy isolated_mpv.mpv_terminate_destroy
#define mpv_error_string isolated_mpv.mpv_error_string
#define mpv_event_name isolated_mpv.mpv_event_name
#define mpv_set_option_string isolated_mpv.mpv_set_option_string
#define mpv_observe_property isolated_mpv.mpv_observe_property
#define mpv_command_async isolated_mpv.mpv_command_async
#define mpv_set_property_async isolated_mpv.mpv_set_property_async
#define mpv_set_wakeup_callback isolated_mpv.mpv_set_wakeup_callback
#define mpv_wait_event isolated_mpv.mpv_wait_event
#define mpv_render_context_create isolated_mpv.mpv_render_context_create
#define mpv_render_context_free isolated_mpv.mpv_render_context_free
#define mpv_render_context_render isolated_mpv.mpv_render_context_render
#define mpv_render_context_update isolated_mpv.mpv_render_context_update
#define mpv_render_context_set_update_callback isolated_mpv.mpv_render_context_set_update_callback
#undef MPV_ISOLATED_FUNCTIONS
#endif
