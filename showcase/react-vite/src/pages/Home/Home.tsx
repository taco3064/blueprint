import { StoryFeed } from '~app/containers/StoryFeed';

export function Home() {
  return <StoryFeed limit={10} />;
}
