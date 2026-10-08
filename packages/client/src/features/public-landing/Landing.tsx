import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faBell, faCalendarDays, faChartLine, faClipboardCheck, faClock, faDisplay, faScissors, faShieldHalved, faUsers, faWallet } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ru } from '@/shared/i18n/ru';
import { useSession } from '@/hooks/use-session';

const featureIcons = [faCalendarDays, faClipboardCheck, faUsers, faWallet, faBell, faChartLine];
const benefitIcons = [faShieldHalved, faClock, faDisplay, faBell];

function ThemePreview({ light, dark, alt, eager = false }: { light: string; dark: string; alt: string; eager?: boolean }) {
  return <picture>
    <source media="(prefers-color-scheme: dark)" srcSet={dark}/>
    <img alt={alt} className="block h-auto w-full" decoding="async" height={900} loading={eager ? 'eager' : 'lazy'} src={light} width={1440}/>
  </picture>;
}

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

  return <main className="overflow-hidden font-landing text-neutral-900">
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-0/95 backdrop-blur">
      <nav aria-label={text.navLabel} className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between gap-4 px-5 sm:px-8 xl:px-0">
        <a aria-label={text.homeLabel} className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight" href="#top"><span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-primary-600 text-xs font-semibold text-on-accent">B</span>{text.eyebrow}</a>
        <div className="ml-auto hidden items-center gap-6 text-[13px] text-neutral-600 md:flex">{text.nav.map((label, index) => <a className="transition-colors hover:text-neutral-900" href={['#features', '#how-it-works', '#benefits', '#demo'][index]} key={label}>{label}</a>)}</div>
        <div className="flex shrink-0 items-center gap-3"><Link className="hidden border-l border-neutral-200 pl-5 pr-1 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:text-neutral-900 sm:inline-flex" to="/login">{text.login}</Link><Button asChild size="small"><Link to={primaryHref}>{signedIn ? text.openApp : text.start}</Link></Button></div>
      </nav>
    </header>

    <section className="mx-auto max-w-[1280px] px-5 pb-16 pt-24 sm:pt-40 md:px-8 xl:px-0" id="top">
      <div className="max-w-[1000px]" data-reveal>
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-neutral-500">{text.eyebrow}</p>
        <h1 className="mt-5 max-w-[980px] whitespace-pre-line text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-5xl lg:text-[64px]">{text.headline}</h1>
        <p className="mt-5 max-w-[720px] text-base leading-7 text-neutral-600 sm:text-lg">{text.subheadline}</p>
        <div className="mt-7 flex flex-wrap items-center gap-4"><Button asChild><Link to={primaryHref}>{signedIn ? text.openApp : text.start}</Link></Button><Link className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900" to="/login">{text.login}</Link></div>
      </div>
      <figure className="landing-mockup mx-auto mt-14 w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm md:w-[68%] lg:mt-10" data-reveal>
        <ThemePreview alt={text.dashboardAlt} dark="/images/dashboard-dark.png" eager light="/images/dashboard-light.png"/>
      </figure>
    </section>

    <section className="border-t border-neutral-200" id="features"><div className="mx-auto max-w-[1280px] px-5 py-16 sm:py-20 md:px-8 xl:px-0"><div className="max-w-2xl" data-reveal><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{text.featuresTitle}</h2></div><div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">{text.features.map((feature, index) => <article className="flex gap-4" data-reveal key={feature.title}><FontAwesomeIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-neutral-500" icon={featureIcons[index] ?? faScissors}/><div><h3 className="text-base font-medium">{feature.title}</h3><p className="mt-1.5 text-sm leading-6 text-neutral-600">{feature.description}</p></div></article>)}</div></div></section>

    <section className="border-y border-neutral-200 bg-neutral-50" id="how-it-works"><div className="mx-auto max-w-[1280px] px-5 py-16 sm:py-20 md:px-8 xl:px-0"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" data-reveal>{text.stepsTitle}</h2><ol className="mt-8 grid gap-8 md:grid-cols-3">{text.steps.map((step, index) => <li className="flex gap-4" data-reveal key={step.title}><span className="grid size-8 shrink-0 place-items-center rounded-full border border-neutral-300 text-sm font-medium tabular-nums text-neutral-700">{index + 1}</span><div><h3 className="text-sm font-semibold">{step.title}</h3><p className="mt-1.5 text-sm leading-6 text-neutral-600">{step.description}</p></div></li>)}</ol></div></section>

    <section className="mx-auto max-w-[1280px] px-5 py-16 sm:py-20 md:px-8 xl:px-0" id="demo"><div className="flex flex-wrap items-end justify-between gap-3" data-reveal><div><p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-500">{text.eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{text.demoTitle}</h2></div><Link className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900" to={primaryHref}>{signedIn ? text.openApp : text.demoLink}<FontAwesomeIcon aria-hidden="true" className="size-3.5" icon={faArrowRight}/></Link></div><figure className="landing-mockup mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm" data-reveal><ThemePreview alt={text.calendarAlt} dark="/images/calendar-dark.png" light="/images/calendar-light.png"/></figure><p className="mt-3 text-xs text-neutral-500">{text.calendarCaption}</p></section>

    <section className="border-y border-neutral-200 bg-neutral-50" id="benefits"><div className="mx-auto max-w-[1280px] px-5 py-16 sm:py-20 md:px-8 xl:px-0"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" data-reveal>{text.uniqueTitle}</h2><div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">{text.unique.map((item, index) => <article className="flex gap-4" data-reveal key={item.title}><FontAwesomeIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-neutral-500" icon={benefitIcons[index] ?? faShieldHalved}/><div><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1.5 text-sm leading-6 text-neutral-600">{item.description}</p></div></article>)}</div></div></section>

    <section className="bg-landing-cta px-5 py-16 text-landing-cta-foreground md:px-8 md:py-20"><div className="mx-auto max-w-[1280px]" data-reveal><h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]">{text.ctaTitle}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-landing-cta-muted">{text.ctaText}</p><Button asChild className="mt-6"><Link to={primaryHref}>{signedIn ? text.openApp : text.start}</Link></Button></div></section>

    <footer className="border-t border-neutral-200 bg-neutral-0"><div className="mx-auto max-w-[1280px] px-5 py-10 md:px-8 xl:px-0"><div className="grid grid-cols-2 gap-8 sm:grid-cols-4">{text.footerGroups.map((group) => <section key={group.title}><h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500">{group.title}</h2><ul className="mt-3 grid gap-2 text-[13px] text-neutral-600">{group.links.map((item) => <li key={item.label}>{item.href.startsWith('#') ? <a className="hover:text-neutral-900" href={item.href}>{item.label}</a> : <Link className="hover:text-neutral-900" to={item.href}>{item.label}</Link>}</li>)}</ul></section>)}</div><div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4"><a className="text-sm font-semibold" href="#top">{text.eyebrow}</a><p className="text-xs text-neutral-500">{text.footer}</p><p className="text-xs text-neutral-500">© {new Date().getFullYear()} BeautyFlow</p></div></div></footer>
  </main>;
}
