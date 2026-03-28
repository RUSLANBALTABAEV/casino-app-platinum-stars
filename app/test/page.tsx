export default function TestPage() {
  return (
    <div className="min-h-screen bg-night text-platinum p-8">
      <h1 className="text-3xl font-bold text-gold-400 mb-8">Тест стилей</h1>

      <div className="space-y-6">
        <div className="bg-black/40 border border-gold-400/40 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-platinum mb-4">Быстрые тесты</h2>
          <div className="flex flex-wrap gap-3">
            <a
              href="/test/case-opening"
              className="inline-flex items-center justify-center rounded-full bg-gold-400 px-5 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-night transition active:scale-[0.98]"
            >
              🎁 Превью открытия кейса
            </a>
          </div>
        </div>

        <div className="bg-black/40 border border-gold-400/40 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-platinum mb-4">Цвета и фон</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-night p-4 rounded-lg text-center">
              <p className="text-platinum">bg-night</p>
            </div>
            <div className="bg-black/60 p-4 rounded-lg text-center">
              <p className="text-platinum">bg-black/60</p>
            </div>
            <div className="bg-gold-400 p-4 rounded-lg text-center">
              <p className="text-night">bg-gold-400</p>
            </div>
            <div className="bg-platinum p-4 rounded-lg text-center">
              <p className="text-night">bg-platinum</p>
            </div>
          </div>
        </div>

        <div className="bg-black/40 border border-gold-400/40 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-platinum mb-4">Текст и кнопки</h2>
          <div className="space-y-4">
            <p className="text-platinum">Обычный текст (text-platinum)</p>
            <p className="text-gold-400">Золотой текст (text-gold-400)</p>
            <p className="text-platinum/60">Полупрозрачный текст (text-platinum/60)</p>

            <div className="flex gap-4">
              <button className="px-6 py-3 bg-gold-400 text-night rounded-3xl font-semibold hover:shadow-glow transition-shadow">
                Золотая кнопка
              </button>
              <button className="px-6 py-3 border border-gold-400/70 text-platinum rounded-3xl font-semibold hover:border-gold-400 transition-colors">
                Прозрачная кнопка
              </button>
            </div>
          </div>
        </div>

        <div className="bg-black/40 border border-gold-400/40 rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-platinum mb-4">Карточки и границы</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gold-400/40 bg-black/40 rounded-3xl p-4">
              <p className="text-platinum">Карточка с золотой границей</p>
            </div>
            <div className="border border-platinum/20 bg-black/20 rounded-2xl p-4">
              <p className="text-platinum">Карточка с платиновой границей</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}






