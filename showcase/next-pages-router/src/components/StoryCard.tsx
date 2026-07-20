import { useTheme } from '~app/hooks/useTheme';

export function StoryCard({ story }: { story: { id: number; title: string } }) {
  const { theme } = useTheme();
  return <article data-theme={theme}>{story.title}</article>;
}
