import { Redirect } from 'expo-router';

// Session 03 decides the destination from the signed-in role; until then, sign-in.
export default function Index() {
  return <Redirect href="/login" />;
}
