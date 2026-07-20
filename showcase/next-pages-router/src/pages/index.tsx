import { StoryFeed } from '~app/containers/StoryFeed';

export default function HomePage() {
  return <StoryFeed limit={10} />;
}
