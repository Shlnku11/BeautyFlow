import { ru } from '@/shared/i18n/ru';

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-12">
      <section className="w-full rounded-xl border border-neutral-200 bg-neutral-0 p-6 shadow-sm md:p-8">
        <p className="text-sm font-semibold text-primary-700">{ru.app.name}</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900">{ru.app.bootstrapTitle}</h1>
        <p className="mt-3 max-w-2xl text-base text-neutral-600">{ru.app.bootstrapDescription}</p>
      </section>
    </div>
  );
}
