import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

// Placeholder shell only — no app features yet.
// Screens are built in the CLAUDE.md "from-empty build order":
// academic year -> classes -> subjects -> chapters -> students ->
// enrollments -> questions -> assessments -> submissions/attendance.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>School App</Text>
      <Text style={styles.subtitle}>Project scaffold — no screens yet.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { marginTop: 8, color: '#666' },
});
