import { redirect } from 'next/navigation';

interface TransferRoutePageProps {
  params: {
    id: string;
  };
}

/**
 * 旧 transfer パス互換。
 * /usage-rights/:id/transfer へのアクセスを
 * /usage-rights/:id?modal=transfer に正規化する。
 */
export default function TransferRoutePage({ params }: TransferRoutePageProps) {
  redirect(`/usage-rights/${params.id}?modal=transfer`);
}

