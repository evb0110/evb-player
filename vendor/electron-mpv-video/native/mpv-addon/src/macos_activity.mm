#import <Foundation/Foundation.h>

void* begin_playback_activity() {
  @autoreleasepool {
    id activity = [[NSProcessInfo processInfo]
        beginActivityWithOptions:(NSActivityUserInitiatedAllowingIdleSystemSleep | NSActivityLatencyCritical)
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
