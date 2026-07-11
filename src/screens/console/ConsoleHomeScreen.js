// Landing screen for developer/admin. Setup screens follow the CLAUDE.md build
// order (academic year -> classes -> ...). No navigation library yet, so the
// console switches between its own screens with local state.
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';
import AcademicYearsScreen from './AcademicYearsScreen';
import ClassesScreen from './ClassesScreen';
import SubjectsScreen from './SubjectsScreen';
import StudentsScreen from './StudentsScreen';
import EnrollmentScreen from './EnrollmentScreen';

export default function ConsoleHomeScreen() {
  const { profile, session, signOut } = useAuth();
  const name = profile?.full_name || session?.user?.email || '';
  const [screen, setScreen] = useState('home'); // 'home' | 'academicYears' | 'classes' | 'subjects' | 'students' | 'enrollments'

  if (screen === 'academicYears') {
    return <AcademicYearsScreen onBack={() => setScreen('home')} />;
  }

  if (screen === 'classes') {
    return (
      <ClassesScreen
        onBack={() => setScreen('home')}
        onManageYears={() => setScreen('academicYears')}
      />
    );
  }

  if (screen === 'subjects') {
    return (
      <SubjectsScreen
        onBack={() => setScreen('home')}
        onManageClasses={() => setScreen('classes')}
      />
    );
  }

  if (screen === 'students') {
    return <StudentsScreen onBack={() => setScreen('home')} />;
  }

  if (screen === 'enrollments') {
    return (
      <EnrollmentScreen
        onBack={() => setScreen('home')}
        onManageYears={() => setScreen('academicYears')}
        onManageClasses={() => setScreen('classes')}
        onManageStudents={() => setScreen('students')}
      />
    );
  }

  return (
    <ScreenContainer>
      <Text variant="title">{t('console.home.title')}</Text>
      <Text variant="body" style={styles.welcome}>
        {t('console.home.welcome', { name })}
      </Text>
      <Text variant="body" color={colors.muted} style={styles.placeholder}>
        {t('console.home.placeholder')}
      </Text>
      <Button
        label={t('console.home.openAcademicYears')}
        onPress={() => setScreen('academicYears')}
        style={styles.nav}
      />
      <Button
        label={t('console.home.openClasses')}
        onPress={() => setScreen('classes')}
        style={styles.action}
      />
      <Button
        label={t('console.home.openSubjects')}
        onPress={() => setScreen('subjects')}
        style={styles.action}
      />
      <Button
        label={t('console.home.openStudents')}
        onPress={() => setScreen('students')}
        style={styles.action}
      />
      <Button
        label={t('console.home.openEnrollments')}
        onPress={() => setScreen('enrollments')}
        style={styles.action}
      />
      <Button
        variant="secondary"
        label={t('auth.signOut')}
        onPress={signOut}
        style={styles.action}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  welcome: { marginTop: spacing.sm },
  placeholder: { marginTop: spacing.md },
  nav: { marginTop: spacing.xl },
  action: { marginTop: spacing.md },
});
