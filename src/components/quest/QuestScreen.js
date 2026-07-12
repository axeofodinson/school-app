// QuestScreen — the student app's screen wrapper: ScreenContainer (safe area,
// keyboard, scroll, and the RTL direction context) on the quest parchment
// background. Console screens keep the plain ScreenContainer; student screens
// use this.
import ScreenContainer from '../ScreenContainer';
import { quest } from '../../theme/quest';

export default function QuestScreen(props) {
  return <ScreenContainer backgroundColor={quest.bg} {...props} />;
}
