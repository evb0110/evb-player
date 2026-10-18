#import <Foundation/Foundation.h>
#include <pthread/qos.h>
#include <sys/resource.h>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <mutex>

namespace {
struct PlaybackActivity {id token;};
std::mutex policy_mutex;
unsigned active_playbacks = 0;
// XNU's resource_private.h. TASK_CATEGORY_POLICY cannot restore TASK_UNSPECIFIED;
// the Darwin role interface can restore every role returned by its getter.
constexpr int darwin_role_priority = 6;
constexpr int foreground_role = 1;
int previous_role = 0;
int previous_background = 0;
bool policy_saved = false;

void begin_playback_policy() {
  if (active_playbacks++ != 0) return;
  errno = 0;
  previous_background = getpriority(PRIO_DARWIN_PROCESS, 0);
  const bool background_valid = errno == 0;
  errno = 0;
  previous_role = getpriority(darwin_role_priority, 0);
  policy_saved = background_valid && errno == 0;
  // Confirm that the original role is restorable before overriding it.
  if (policy_saved && setpriority(darwin_role_priority, 0, previous_role) != 0) policy_saved = false;
  if (!policy_saved) return;
  const int reset = setpriority(PRIO_DARWIN_PROCESS, 0, 0);
  const int assigned = setpriority(darwin_role_priority, 0, foreground_role);
  if (std::getenv("EVB_PLAYER_TEST_DIAGNOSTICS")) {
    std::fprintf(stderr, "Native playback policy: background=%d role=%d reset=%d foreground=%d\n",
        previous_background, previous_role, reset, assigned);
  }
}

void end_playback_policy() {
  if (active_playbacks == 0 || --active_playbacks != 0 || !policy_saved) return;
  setpriority(PRIO_DARWIN_PROCESS, 0, previous_background ? PRIO_DARWIN_BG : 0);
  setpriority(darwin_role_priority, 0, previous_role);
  if (std::getenv("EVB_PLAYER_TEST_DIAGNOSTICS")) {
    errno = 0;
    const int restored = getpriority(darwin_role_priority, 0);
    const int status = errno;
    std::fprintf(stderr, "Native playback policy restored: expected-background=%d background=%d expected-role=%d role=%d status=%d\n",
        previous_background, getpriority(PRIO_DARWIN_PROCESS, 0), previous_role, restored, status);
  }
  policy_saved = false;
}
}

int set_playback_thread_priority(bool rendering) {
  return pthread_set_qos_class_self_np(rendering ? QOS_CLASS_USER_INTERACTIVE : QOS_CLASS_USER_INITIATED, 0);
}

void* begin_playback_activity() {
  @autoreleasepool {
    auto* result = new PlaybackActivity{nil};
    std::lock_guard<std::mutex> lock(policy_mutex);
    begin_playback_policy();
    id activity = [[NSProcessInfo processInfo]
        beginActivityWithOptions:NSActivityUserInitiatedAllowingIdleSystemSleep
        reason:@"EVB Player playback"];
    result->token = [activity retain];
    return result;
  }
}

void end_playback_activity(void* token) {
  if (!token) return;
  @autoreleasepool {
    std::lock_guard<std::mutex> lock(policy_mutex);
    auto* activity = static_cast<PlaybackActivity*>(token);
    [[NSProcessInfo processInfo] endActivity:activity->token];
    [activity->token release];
    delete activity;
    end_playback_policy();
  }
}
