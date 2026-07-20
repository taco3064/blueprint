import { StoryFeed } from '~app/containers/StoryFeed';

export default function RootLayout() {
  return <html><body><StoryFeed limit={10} /></body></html>;
}
