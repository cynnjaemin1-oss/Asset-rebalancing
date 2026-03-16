interface Props {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSave: (key: string) => void;
}

export default function SettingsModal({ isOpen, onClose, apiKey, onSave }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-t-3xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">설정</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="font-semibold text-sm">Alpha Vantage API 키</div>
            <div className="text-xs text-gray-400 mt-0.5">
              국내/미국 주식 현재가 조회에 필요합니다. 업비트(암호화폐)는 불필요.
            </div>
          </div>

          <input
            type="text"
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm font-mono"
            placeholder="예: ABCDEF1234567890"
            defaultValue={apiKey}
            id="api-key-input"
          />

          <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-xs text-gray-500">
            <div className="font-semibold text-gray-700">무료 API 키 발급 방법</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>아래 링크 접속</li>
              <li>이메일 입력 후 "GET FREE API KEY" 클릭</li>
              <li>이메일로 발송된 키 복사 후 위에 입력</li>
            </ol>
            <div className="text-xs text-gray-400">무료: 하루 25회 조회 / 분당 5회</div>
          </div>

          <a
            href="https://www.alphavantage.co/support/#api-key"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 text-center border border-gray-200 rounded-2xl text-sm text-blue-600"
          >
            → alphavantage.co 에서 무료 키 발급
          </a>

          <button
            onClick={() => {
              const input = document.getElementById('api-key-input') as HTMLInputElement;
              onSave(input.value.trim());
              onClose();
            }}
            className="w-full py-3 bg-black text-white rounded-2xl font-semibold text-sm"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
