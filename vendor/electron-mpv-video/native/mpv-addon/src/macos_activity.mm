#import <Foundation/Foundation.h>
#include <pthread/qos.h>
#include <mach/mach.h>
#include <sys/resource.h>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <mutex>

namespace {
struct PlaybackActivity {id token;};
std::mutex policy_mutex;
unsigned active_playbacks = 0;
task_category_policy_data_t previous_role = {};
int previous_background = 0;
bool policy_saved = false;

void begin_playback_policy() {
  if (active_playbacks++ != 0) return;
  mach_msg_type_number_t count = TASK_CATEGORY_POLICY_COUNT;
  boolean_t defaults = false;
  errno = 0;
  previous_background = getpriority(PRIO_DARWIN_PROCESS, 0);
  const bool background_valid = errno == 0;
  const kern_return_t queried = task_policy_get(mach_task_self(), TASK_CATEGORY_POLICY,
      reinterpret_cast<task_policy_t>(&previous_role), &count, &defaults);
  policy_saved = background_valid && queried == KERN_SUCCESS;
  if (!policy_saved) return;
  // CLI helpers may start with TASK_UNSPECIFIED, which the Mach setter rejects.
  // Establish a restorable idle background role before the first playback boost.
  const kern_return_t restorable = task_policy_set(mach_task_self(), TASK_CATEGORY_POLICY,
      reinterpret_cast<task_policy_t>(&previous_role), TASK_CATEGORY_POLICY_COUNT);
  if (restorable != KERN_SUCCESS) {
    if (previous_role.role != TASK_UNSPECIFIED) {policy_saved = false; return;}
    previous_role.role = TASK_BACKGROUND_APPLICATION;
    const kern_return_t idle = task_policy_set(mach_task_self(), TASK_CATEGORY_POLICY,
        reinterpret_cast<task_policy_t>(&previous_role), TASK_CATEGORY_POLICY_COUNT);
    if (idle != KERN_SUCCESS) {policy_saved = false; return;}
  }
  const int reset = setpriority(PRIO_DARWIN_PROCESS, 0, 0);
  task_category_policy_data_t foreground = {TASK_FOREGROUND_APPLICATION};
  const kern_return_t assigned = task_policy_set(mach_task_self(), TASK_CATEGORY_POLICY,
      reinterpret_cast<task_policy_t>(&foreground), TASK_CATEGORY_POLICY_COUNT);
  if (std::getenv("EVB_PLAYER_TEST_DIAGNOSTICS")) {
    std::fprintf(stderr, "Native playback policy: background=%d role=%d reset=%d foreground=%d\n",
        previous_background, previous_role.role, reset, assigned);
  }
}

void end_playback_policy() {
  if (active_playbacks == 0 || --active_playbacks != 0 || !policy_saved) return;
  setpriority(PRIO_DARWIN_PROCESS, 0, previous_background ? PRIO_DARWIN_BG : 0);
  task_policy_set(mach_task_self(), TASK_CATEGORY_POLICY,
      reinterpret_cast<task_policy_t>(&previous_role), TASK_CATEGORY_POLICY_COUNT);
  if (std::getenv("EVB_PLAYER_TEST_DIAGNOSTICS")) {
    task_category_policy_data_t restored = {};
    mach_msg_type_number_t count = TASK_CATEGORY_POLICY_COUNT;
    boolean_t defaults = false;
    const kern_return_t status = task_policy_get(mach_task_self(), TASK_CATEGORY_POLICY,
        reinterpret_cast<task_policy_t>(&restored), &count, &defaults);
    std::fprintf(stderr, "Native playback policy restored: expected-background=%d background=%d expected-role=%d role=%d status=%d\n",
        previous_background, getpriority(PRIO_DARWIN_PROCESS, 0), previous_role.role, restored.role, status);
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
