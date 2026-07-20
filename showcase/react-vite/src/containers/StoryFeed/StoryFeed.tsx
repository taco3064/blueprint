import { StoryCard } from '~app/components/StoryCard';
import { ThemeProvider } from '~app/contexts/ThemeContext';
import { useStories } from '~app/hooks/useStories';

export function StoryFeed({ limit }: { limit: number }) {
  const stories = useStories(limit);

  return (
    <ThemeProvider>
      {stories.map((story) => <StoryCard key={story.id} story={story} />)}
    </ThemeProvider>
  );
}
