#import <Foundation/Foundation.h>
#include <pthread/qos.h>

void set_playback_thread_priority(bool rendering) {
  pthread_set_qos_class_self_np(rendering ? QOS_CLASS_USER_INTERACTIVE : QOS_CLASS_USER_INITIATED, 0);
}

void* begin_playback_activity() {
  @autoreleasepool {
    id activity = [[NSProcessInfo processInfo]
        beginActivityWithOptions:NSActivityUserInitiatedAllowingIdleSystemSleep
        reason:@"EVB Player playback"];
    return [activity retain];
  }
}

void end_playback_activity(void* token) {
  if (!token) return;
  @autoreleasepool {
    id activity = (id)token;
    [[NSProcessInfo processInfo] endActivity:activity];
    [activity release];
  }
}
