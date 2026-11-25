import { TopicScreen } from '../../../../features/learn/TopicScreen';

// Prep learners' topic page lives at /topic/… so it never shares a URL with the
// school student's /lesson/… (two groups on one path make deep links ambiguous).
export default function PrepTopic() {
  return <TopicScreen root="/topic" />;
}
