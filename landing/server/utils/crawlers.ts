// The same list as evb-stack.com: link-preview, search and other bots.
const CRAWLER_USER_AGENT = /bot|crawler|spider|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegram|slack|discord|skype|viber|vkshare|linkedin|pinterest|embedly|redditbot|applebot|google|bing|yandex|duckduck|mastodon|bluesky|signal|iframely|preview/iu;

export function isCrawler(userAgent: string | undefined) {
  return CRAWLER_USER_AGENT.test(userAgent ?? '');
}
