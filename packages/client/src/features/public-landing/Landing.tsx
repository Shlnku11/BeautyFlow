import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faCalendarDays, faChartLine, faClipboardCheck, faScissors, faShieldHalved, faUsers, faWallet, faDisplay, faClock, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router';
import { ru } from '@/shared/i18n/ru';
import { useSession } from '@/hooks/use-session';

const featureIcons = [faCalendarDays, faClipboardCheck, faUsers, faWallet, faBell, faChartLine];
const benefitIcons = [faShieldHalved, faClock, faDisplay, faBell];

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
  const primaryHref = signedIn ? appPath : '/register';

  return <main className="overflow-hidden text-neutral-900">
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-0/95 backdrop-blur">
      <nav aria-label="Навигация по странице" className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-5 md:px-8">
        <a aria-label="BeautyFlow — начало страницы" className="text-sm font-semibold tracking-tight" href="#top">BeautyFlow</a>
        <div className="hidden items-center gap-6 text-[13px] text-neutral-600 md:flex">{text.nav.map((label, index) => <a className="transition-colors hover:text-neutral-900" href={['#features', '#how-it-works', '#benefits', '#demo'][index]} key={label}>{label}</a>)}</div>
        <div className="flex items-center gap-2"><Link className="hidden rounded-md px-3 py-1.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 sm:inline-flex" to="/login">{text.login}</Link><Link className="inline-flex h-8 items-center rounded-md bg-primary-600 px-3 text-[13px] font-medium text-white transition-colors hover:bg-primary-700" to={primaryHref}>{signedIn ? text.openApp : text.start}</Link></div>
      </nav>
    </header>

    <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-14 sm:py-20 md:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)] md:px-8 md:py-24" id="top">
      <div data-reveal><h1 className="max-w-[620px] text-[42px] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-5xl lg:text-[56px]">{text.headline}</h1><p className="mt-5 max-w-[540px] text-base leading-7 text-neutral-600 sm:text-lg">{text.subheadline}</p><div className="mt-7 flex flex-wrap gap-2"><Link className="inline-flex h-9 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-700" to={primaryHref}>{signedIn ? text.openApp : text.start}</Link><Link className="inline-flex h-9 items-center rounded-md border border-neutral-200 bg-neutral-0 px-4 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50" to="/login">{text.login}</Link></div></div>
      <figure className="landing-mockup w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0" data-reveal><img className="block h-auto w-full" src="/images/dashboard-preview.png" alt={text.dashboardAlt}/></figure>
    </section>

    <section className="mx-auto max-w-[1440px] px-5 py-16 md:px-8 md:py-20" id="features"><div className="max-w-2xl" data-reveal><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{text.featuresTitle}</h2></div><div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">{text.features.map((feature, index) => <article className="flex gap-4" data-reveal key={feature.title}><FontAwesomeIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-neutral-500" icon={featureIcons[index] ?? faScissors}/><div><h3 className="text-[15px] font-semibold">{feature.title}</h3><p className="mt-1.5 text-sm leading-6 text-neutral-600">{feature.description}</p></div></article>)}</div></section>

    <section className="border-y border-neutral-200 bg-neutral-50 py-16 md:py-20" id="how-it-works"><div className="mx-auto max-w-[1440px] px-5 md:px-8"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" data-reveal>{text.stepsTitle}</h2><ol className="mt-8 grid gap-8 md:grid-cols-3">{text.steps.map((step, index) => <li className="flex gap-4" data-reveal key={step.title}><span className="grid size-8 shrink-0 place-items-center rounded-full border border-neutral-300 text-sm font-medium tabular-nums text-neutral-700">{index + 1}</span><div><h3 className="text-sm font-semibold">{step.title}</h3><p className="mt-1.5 text-sm leading-6 text-neutral-600">{step.description}</p></div></li>)}</ol></div></section>

    <section className="mx-auto max-w-[1440px] px-5 py-16 md:px-8 md:py-20" id="demo"><div className="flex flex-wrap items-end justify-between gap-3" data-reveal><div><p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-500">BeautyFlow</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{text.demoTitle}</h2></div><a className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900" href="/login">{text.demoLink}<FontAwesomeIcon aria-hidden="true" className="size-3.5" icon={faArrowRight}/></a></div><figure className="landing-mockup mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0" data-reveal><img className="block h-auto w-full" src="/images/calendar-preview.png" alt={text.calendarAlt}/></figure><p className="mt-3 text-xs text-neutral-500">{text.calendarCaption}</p></section>

    <section className="border-y border-neutral-200 bg-neutral-50 py-16 md:py-20" id="benefits"><div className="mx-auto max-w-[1440px] px-5 md:px-8"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" data-reveal>{text.uniqueTitle}</h2><div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">{text.unique.map((item, index) => <article className="flex gap-4" data-reveal key={item.title}><FontAwesomeIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-neutral-500" icon={benefitIcons[index] ?? faShieldHalved}/><div><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1.5 text-sm leading-6 text-neutral-600">{item.description}</p></div></article>)}</div></div></section>

    <section className="bg-[#09090B] px-5 py-16 text-white md:px-8 md:py-20"><div className="mx-auto max-w-[1440px]" data-reveal><h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{text.ctaTitle}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-neutral-300">{text.ctaText}</p><Link className="mt-6 inline-flex h-9 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-700" to={primaryHref}>{signedIn ? text.openApp : text.start}</Link></div></section>

    <footer className="border-t border-neutral-200 bg-neutral-0"><div className="mx-auto max-w-[1440px] px-5 py-10 md:px-8"><div className="grid grid-cols-2 gap-8 sm:grid-cols-4">{text.footerGroups.map((group) => <section key={group.title}><h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500">{group.title}</h2><ul className="mt-3 grid gap-2 text-[13px] text-neutral-600">{group.links.map((item) => <li key={item.label}>{item.href.startsWith('#') ? <a className="hover:text-neutral-900" href={item.href}>{item.label}</a> : <Link className="hover:text-neutral-900" to={item.href}>{item.label}</Link>}</li>)}</ul></section>)}</div><div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4"><a className="text-sm font-semibold" href="#top">BeautyFlow</a><p className="text-xs text-neutral-500">{text.footer}</p><p className="text-xs text-neutral-500">© {new Date().getFullYear()} BeautyFlow</p></div></div></footer>
  </main>;
}
