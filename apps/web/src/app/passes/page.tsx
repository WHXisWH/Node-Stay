// /passes → /usage-rights へリダイレクト
import { redirect } from 'next/navigation';

export default function PassesRedirectPage() {
  redirect('/usage-rights');
}
