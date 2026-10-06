import { useEffect } from 'react';
import { Link } from 'react-router';
import { ru } from '@/shared/i18n/ru';
import { useSession } from '@/hooks/use-session';

export function LandingPage() {
  const session = useSession();
  const text = ru.landing;

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15 });
    elements.forEach((element) => {
      element.classList.add('reveal-pending');
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  const signedIn = Boolean(session.data);
  const appPath = session.data?.active.role === 'master' ? '/app/my-day' : '/app/dashboard';

  return <main className="landing-page overflow-hidden text-neutral-900">
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-0">
      <nav aria-label="Навигация по странице" className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <a aria-label="BeautyFlow — начало страницы" className="text-xl font-bold tracking-tight text-primary-800" href="#top">BeautyFlow</a>
        <div className="hidden items-center gap-6 text-sm font-medium text-neutral-700 md:flex">{text.nav.map((label, index) => <a className="transition-colors hover:text-primary-700" href={['#features', '#how-it-works', '#benefits', '#demo'][index]} key={label}>{label}</a>)}</div>
        <div className="flex items-center gap-2"><Link className="hidden rounded-md px-3 py-2 text-sm font-medium text-neutral-700 sm:inline-flex" to="/login">{text.login}</Link><Link className="inline-flex h-10 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-neutral-0 transition-colors hover:bg-primary-700" to={signedIn ? appPath : '/register'}>{signedIn ? text.openApp : text.start}</Link></div>
      </nav>
    </header>

    <section className="landing-hero relative isolate" id="top">
      <div aria-hidden="true" className="landing-glow landing-glow-one"/><div aria-hidden="true" className="landing-glow landing-glow-two"/>
      <div className="mx-auto grid min-h-[620px] max-w-7xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:px-8 md:py-24">
        <div className="relative z-10" data-reveal><p className="mb-5 inline-flex rounded-md border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-xs font-medium text-neutral-600">{text.eyebrow}</p><h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-5xl">{text.headline}</h1><p className="mt-5 max-w-xl text-lg leading-8 text-neutral-600">{text.subheadline}</p><div className="mt-7 flex flex-wrap gap-3"><Link className="inline-flex h-11 items-center rounded-md bg-primary-600 px-5 text-sm font-medium text-neutral-0 transition-colors hover:bg-primary-700" to={signedIn ? appPath : '/register'}>{signedIn ? text.openApp : text.start}</Link><a className="inline-flex h-11 items-center rounded-md border border-neutral-300 bg-neutral-0 px-5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100" href="#features">{text.explore}</a></div></div>
        <figure className="landing-mockup relative z-10 mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-neutral-200 bg-neutral-0 shadow-lg" data-reveal><img className="block h-auto w-full" src="/images/dashboard-preview.png" alt="Скриншот обзора BeautyFlow с KPI и ближайшими записями" /></figure>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-5 py-20 md:px-8" id="features"><div className="mx-auto max-w-2xl text-center" data-reveal><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{text.featuresTitle}</h2></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{text.features.map((feature, index) => <article className="rounded-lg border border-neutral-200 bg-neutral-0 p-5 shadow-sm transition-colors hover:border-neutral-300" data-reveal key={feature.title}><p className="mb-6 text-xs font-medium tabular-nums text-primary-700">{String(index + 1).padStart(2, '0')}</p><h3 className="text-base font-semibold">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-neutral-600">{feature.description}</p></article>)}</div></section>

    <section className="bg-primary-50/80 py-20" id="how-it-works"><div className="mx-auto max-w-7xl px-5 md:px-8"><div className="mx-auto max-w-2xl text-center" data-reveal><h2 className="text-3xl font-bold sm:text-4xl">{text.stepsTitle}</h2></div><ol className="mt-12 grid gap-6 md:grid-cols-3">{text.steps.map((step, index) => <li className="rounded-lg border border-neutral-200 bg-neutral-0 p-7 shadow-sm" data-reveal key={step.title}><span className="grid size-12 place-items-center rounded-full bg-primary-600 text-xl font-bold text-white shadow-sm">{index + 1}</span><h3 className="mt-5 text-xl font-bold">{step.title}</h3><p className="mt-2 leading-6 text-neutral-600">{step.description}</p></li>)}</ol></div></section>

    <section className="mx-auto max-w-7xl px-5 py-20 md:px-8" id="demo"><div className="text-center" data-reveal><h2 className="text-3xl font-bold sm:text-4xl">{text.demoTitle}</h2></div><div className="mt-10 grid gap-5 md:grid-cols-3">{text.demoLabels.map((label, index) => <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-3 shadow-sm" data-reveal key={label}><div className={`demo-screen demo-screen-${index + 1} grid min-h-52 content-start gap-3 rounded-2xl bg-white p-4`}><div className="h-3 w-1/3 rounded-full bg-primary-200"/><div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((item) => <div className="h-14 rounded-xl bg-primary-50 shadow-sm" key={item}/>)}</div><div className="h-20 rounded-xl bg-primary-100/80"/><div className="h-3 w-2/3 rounded-full bg-neutral-100"/></div><p className="px-2 pb-2 pt-4 font-semibold text-primary-900">{label}</p></div>)}</div></section>

    <section className="bg-neutral-50 py-20" id="benefits"><div className="mx-auto max-w-7xl px-5 md:px-8"><h2 className="max-w-2xl text-3xl font-bold sm:text-4xl" data-reveal>{text.uniqueTitle}</h2><div className="mt-10 grid gap-4 sm:grid-cols-2">{text.unique.map((item, index) => <article className="flex gap-4 rounded-lg bg-neutral-0 p-6 shadow-sm" data-reveal key={item.title}><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-100 font-bold text-primary-800">0{index + 1}</span><div><h3 className="font-bold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-neutral-600">{item.description}</p></div></article>)}</div></div></section>

    <section className="px-5 py-20 md:px-8"><div className="mx-auto max-w-5xl rounded-lg bg-[#111827] px-6 py-14 text-center text-white sm:px-12" data-reveal><h2 className="text-3xl font-semibold sm:text-4xl">{text.ctaTitle}</h2><p className="mx-auto mt-4 max-w-xl text-neutral-300 leading-7">{text.ctaText}</p><Link className="mt-7 inline-flex h-10 items-center rounded-md bg-white px-5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100" to={signedIn ? appPath : '/register'}>{signedIn ? text.openApp : text.start}</Link></div></section>

    <footer className="border-t border-primary-100 bg-white/80"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-neutral-600 sm:flex-row sm:items-center sm:justify-between md:px-8"><a className="font-bold text-primary-800" href="#top">BeautyFlow</a><p>{text.footer}</p><Link className="font-semibold text-primary-800 hover:underline" to="/login">{text.login}</Link></div></footer>
  </main>;
}
