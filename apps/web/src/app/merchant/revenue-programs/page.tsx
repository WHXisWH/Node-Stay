'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createNodeStayClient } from '../../../services/nodestay';

type RevenueScope = 'USAGE_ONLY' | 'COMPUTE_ONLY' | 'ALL';
type SettlementCycle = 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface InvestorDraft {
  holderUserId: string;
  amount1155: string;
}

interface ProgramRow {
  id: string;
  machineId: string;
  shareBps: number;
  revenueScope: string;
  startAt: string;
  endAt: string;
  settlementCycle: string;
  status: string;
}

interface MachineRow {
  id: string;
  machineId: string;
  machineClass: string;
  status: string;
  localLabel: string;
}

function toInputDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (v: number) => String(v).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

function parseInvestorText(value: string): InvestorDraft[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [holderUserId, amount1155] = line.split(',').map((v) => v.trim());
      return { holderUserId, amount1155 };
    })
    .filter((row) => row.holderUserId.length > 0 && /^\d+$/.test(row.amount1155));
}

export default function MerchantRevenueProgramsPage() {
  const client = useMemo(() => createNodeStayClient(), []);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [merchantId, setMerchantId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [shareBps, setShareBps] = useState(1200);
  const [revenueScope, setRevenueScope] = useState<RevenueScope>('ALL');
  const [settlementCycle, setSettlementCycle] = useState<SettlementCycle>('MONTHLY');
  const [startAt, setStartAt] = useState(toInputDateTime(new Date().toISOString()));
  const [endAt, setEndAt] = useState(toInputDateTime(new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString()));
  const [investorText, setInvestorText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [apiMachines, apiPrograms] = await Promise.all([
        client.listMachines(),
        client.listRevenuePrograms(),
      ]);

      const machineRows: MachineRow[] = apiMachines.map((m) => ({
        id: m.id,
        machineId: m.machineId,
        machineClass: m.machineClass,
        status: m.status,
        localLabel: `${m.machineClass} / ${m.machineId.slice(0, 10)}...`,
      }));

      setMachines(machineRows);
      if (!machineId && machineRows.length > 0) {
        setMachineId(machineRows[0].id);
      }

      setPrograms(apiPrograms);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ロードに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [client, machineId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createProgram = useCallback(async () => {
    if (!merchantId.trim()) {
      setError('merchantId を入力してください');
      return;
    }
    if (!machineId) {
      setError('machine を選択してください');
      return;
    }

    const investors = parseInvestorText(investorText);
    if (investors.length === 0) {
      setError('投資家を 1 件以上入力してください（形式: userId,amount）');
      return;
    }
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError('開始/終了日時の形式が不正です');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await client.createRevenueProgram({
        merchantId: merchantId.trim(),
        machineId,
        shareBps,
        revenueScope,
        settlementCycle,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        investors,
      });
      setSuccess(`Program 作成完了: ${created.programId}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }, [client, merchantId, machineId, shareBps, revenueScope, settlementCycle, startAt, endAt, investorText, load]);

  const approveProgram = useCallback(async (programId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await client.approveRevenueProgram(programId, {});
      setSuccess(`Program 承認完了: ${res.programId}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '承認に失敗しました');
    }
  }, [client, load]);

  const issueProgram = useCallback(async (programId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await client.issueRevenueProgram(programId, {});
      setSuccess(`発行成功: #${res.onchainProgramId} / tx=${res.txHash.slice(0, 12)}...`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '発行に失敗しました');
    }
  }, [client, load]);

  return (
    <>
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <Link href="/merchant" className="hover:text-slate-300 transition-colors">加盟店管理</Link>
            <span>/</span>
            <span className="text-slate-300">収益プログラム</span>
          </nav>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-slate-400 text-sm mb-1">Merchant Revenue Program</p>
              <h1 className="text-3xl font-extrabold text-white">収益権プログラム管理</h1>
            </div>
            <Link href="/merchant/dashboard" className="btn-secondary py-2 px-4 text-sm">
              ダッシュボードへ戻る
            </Link>
          </div>
        </div>
      </div>

      <div className="container-main py-8 flex flex-col gap-6">
        {(error || success) && (
          <div className={`card p-4 text-sm ${error ? 'text-red-600' : 'text-emerald-700'}`}>
            {error ?? success}
          </div>
        )}

        <div className="card p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">新規プログラム作成</h2>
          <p className="text-xs text-slate-500 mb-5">
            investors は 1 行 1 件で `userId,amount` を入力してください。例: `1111-...-aaaa,1000`
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm text-slate-700">
              Merchant ID
              <input
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="merchant UUID"
              />
            </label>

            <label className="text-sm text-slate-700">
              Machine
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">選択してください</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>{m.localLabel} ({m.status})</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-700">
              shareBps
              <input
                type="number"
                min={1}
                max={4000}
                value={shareBps}
                onChange={(e) => setShareBps(Number(e.target.value || 0))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>

            <label className="text-sm text-slate-700">
              Revenue Scope
              <select
                value={revenueScope}
                onChange={(e) => setRevenueScope(e.target.value as RevenueScope)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="ALL">ALL</option>
                <option value="USAGE_ONLY">USAGE_ONLY</option>
                <option value="COMPUTE_ONLY">COMPUTE_ONLY</option>
              </select>
            </label>

            <label className="text-sm text-slate-700">
              Settlement Cycle
              <select
                value={settlementCycle}
                onChange={(e) => setSettlementCycle(e.target.value as SettlementCycle)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="DAILY">DAILY</option>
                <option value="WEEKLY">WEEKLY</option>
                <option value="MONTHLY">MONTHLY</option>
              </select>
            </label>

            <label className="text-sm text-slate-700">
              Start
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>

            <label className="text-sm text-slate-700">
              End
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </label>
          </div>

          <label className="block text-sm text-slate-700 mt-4">
            Investors (userId,amount)
            <textarea
              value={investorText}
              onChange={(e) => setInvestorText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 h-32 font-mono text-xs"
              placeholder={'user-uuid-1,1000\nuser-uuid-2,500'}
            />
          </label>

          <button
            onClick={() => void createProgram()}
            disabled={submitting}
            className="btn-primary mt-5 px-4 py-2"
          >
            {submitting ? '作成中...' : '草稿を作成'}
          </button>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">プログラム一覧</h2>
            <button className="btn-secondary px-3 py-2 text-sm" onClick={() => void load()}>
              再読み込み
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">読み込み中...</p>
          ) : programs.length === 0 ? (
            <p className="text-sm text-slate-500">プログラムがありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="py-2 pr-4">Program</th>
                    <th className="py-2 pr-4">Machine</th>
                    <th className="py-2 pr-4">Share</th>
                    <th className="py-2 pr-4">Cycle</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50">
                      <td className="py-3 pr-4 font-mono text-xs">{p.id.slice(0, 8)}...</td>
                      <td className="py-3 pr-4 font-mono text-xs">{p.machineId.slice(0, 10)}...</td>
                      <td className="py-3 pr-4">{(p.shareBps / 100).toFixed(2)}%</td>
                      <td className="py-3 pr-4">{p.settlementCycle}</td>
                      <td className="py-3 pr-4">
                        <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => void approveProgram(p.id)}
                            disabled={p.status !== 'PENDING_REVIEW'}
                            className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
                          >
                            承認
                          </button>
                          <button
                            onClick={() => void issueProgram(p.id)}
                            disabled={p.status !== 'APPROVED'}
                            className="btn-primary px-2 py-1 text-xs disabled:opacity-40"
                          >
                            発行(オンチェーン)
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
