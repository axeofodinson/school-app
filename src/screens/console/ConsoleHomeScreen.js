// Landing screen for developer/admin. Setup screens follow the CLAUDE.md build
// order (academic year -> classes -> ...). No navigation library yet, so the
// console switches between its own screens with local state.
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button, LanguageSwitch } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';
import AcademicYearsScreen from './AcademicYearsScreen';
import ClassesScreen from './ClassesScreen';
import SubjectsScreen from './SubjectsScreen';
import StudentsScreen from './StudentsScreen';
import EnrollmentScreen from './EnrollmentScreen';
import AssessmentBuilderScreen from './AssessmentBuilderScreen';
import AttendanceScreen from './AttendanceScreen';
import OverdueAssignmentsScreen from './OverdueAssignmentsScreen';
import MessagesScreen from './MessagesScreen';
import DevConsoleScreen from '../dev/DevConsoleScreen';

export default function ConsoleHomeScreen() {
  const { profile, session, role, signOut } = useAuth();
  const name = profile?.full_name || session?.user?.email || '';
  // Only the developer role sees the dev console; admins never get an entry
  // point to it. The hard-delete tool it fronts is dev-only (db/011).
  const isDev = role === 'developer';
  const [screen, setScreen] = useState('home'); // 'home' | 'academicYears' | 'classes' | 'subjects' | 'students' | 'enrollments' | 'assessments' | 'attendance' | 'dev'

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

  if (screen === 'assessments') {
    return (
      <AssessmentBuilderScreen
        onBack={() => setScreen('home')}
        onManageYears={() => setScreen('academicYears')}
        onManageClasses={() => setScreen('classes')}
      />
    );
  }

  if (screen === 'attendance') {
    return (
      <AttendanceScreen
        onBack={() => setScreen('home')}
        onManageYears={() => setScreen('academicYears')}
        onManageClasses={() => setScreen('classes')}
        onManageEnrollments={() => setScreen('enrollments')}
      />
    );
  }

  if (screen === 'overdue') {
    return (
      <OverdueAssignmentsScreen
        onBack={() => setScreen('home')}
        onManageYears={() => setScreen('academicYears')}
      />
    );
  }

  if (screen === 'messages') {
    return <MessagesScreen onBack={() => setScreen('home')} />;
  }

  if (screen === 'dev' && isDev) {
    return <DevConsoleScreen onBack={() => setScreen('home')} />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="title">{t('console.home.title')}</Text>
        <LanguageSwitch />
      </View>
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
        label={t('console.home.openAssessments')}
        onPress={() => setScreen('assessments')}
        style={styles.action}
      />
      <Button
        label={t('console.home.openAttendance')}
        onPress={() => setScreen('attendance')}
        style={styles.action}
      />
      <Button
        label={t('console.home.openOverdue')}
        onPress={() => setScreen('overdue')}
        style={styles.action}
      />
      <Button
        label={t('console.home.openMessages')}
        onPress={() => setScreen('messages')}
        style={styles.action}
      />
      {isDev ? (
        <Button
          variant="secondary"
          label={t('console.home.openDevTools')}
          onPress={() => setScreen('dev')}
          style={styles.action}
        />
      ) : null}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  welcome: { marginTop: spacing.sm },
  placeholder: { marginTop: spacing.md },
  nav: { marginTop: spacing.xl },
  action: { marginTop: spacing.md },
});
