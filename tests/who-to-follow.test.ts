// @vitest-environment-options {"url": "https://dev-null.sh/log/latest"}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WhoToFollowCards } from '@/features/who-to-follow/cards';
import { readSuggestions, suggestionList } from '@/site/who-to-follow';

import { actLikeTheSite, FIXTURE_PEOPLE, suggestedRowHtml, whoToFollowHtml } from './fixtures/site';

const section = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>('section[aria-labelledby="aside-who-to-follow"]');

  if (found === null) {
    throw new Error('The block is missing.');
  }

  return found;
};

const list = (): HTMLUListElement => {
  const found = suggestionList(section());

  if (found === null) {
    throw new Error('The list is missing.');
  }

  return found;
};

describe('reading the suggestions', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reads each person from their row', () => {
    document.body.innerHTML = whoToFollowHtml();

    const [ada, , minji] = readSuggestions(list());

    expect(ada).toMatchObject({
      username: 'adapark',
      name: 'Ada Park',
      bio: 'compilers, coffee, and too many side projects',
      reason: 'Followed by 3 you follow',
      isFollowing: false,
    });
    expect(ada?.avatar).toContain('avatars.githubusercontent.com');
    // No bio: only the reason.
    expect(minji).toMatchObject({ bio: null, reason: '12 followers' });
  });

  it('leaves out loading placeholders and people on their way out', () => {
    document.body.innerHTML = whoToFollowHtml();
    list().insertAdjacentHTML('beforeend', '<li aria-hidden="true"><span></span></li>');

    const [first] = list().children;

    if (first instanceof HTMLLIElement) {
      first.inert = true;
    }

    expect(readSuggestions(list()).map((person) => person.username)).toEqual(['tomasreyes', 'minjikim']);
  });

  it('knows who is already followed, and who follows you', () => {
    document.body.innerHTML = whoToFollowHtml();

    const [follow, second] = [...list().querySelectorAll('[data-test="suggested-follow-button"]')];

    follow?.setAttribute('aria-label', 'Unfollow @adapark');
    second?.setAttribute('aria-label', 'Follow @tomasreyes back');

    const [ada, tomas] = readSuggestions(list());

    expect(ada?.isFollowing).toBe(true);
    expect(tomas).toMatchObject({ isFollowing: false, followsYou: true });
  });
});

describe('the cards', () => {
  let controller: AbortController;
  let enabled: boolean;
  let cards: WhoToFollowCards;
  let site: { follows: string[]; dismissals: string[] };

  // No movement in tests: every step happens at once.
  const reducedMotion = (query: string): MediaQueryList =>
    ({ matches: query.includes('reduce'), media: query }) as MediaQueryList;

  const deck = (): ShadowRoot | null | undefined => document.querySelector('[data-dnpp="who-to-follow"]')?.shadowRoot;
  const top = (): string | null | undefined =>
    deck()?.querySelector('.card[data-depth="0"]')?.getAttribute('aria-label');
  const press = (selector: string): void => {
    deck()?.querySelector<HTMLElement>(`.card[data-depth="0"] ${selector}`)?.click();
  };

  const stack = (): (string | null | undefined)[] =>
    [...(deck()?.querySelectorAll('.card') ?? [])]
      .sort((a, b) => Number(a.getAttribute('data-depth')) - Number(b.getAttribute('data-depth')))
      .map((card) => card.getAttribute('aria-label')?.split(',')[0]);
  const key = (key: string): void => {
    deck()?.host.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  };

  beforeEach(() => {
    vi.stubGlobal('matchMedia', reducedMotion);
    document.body.innerHTML = whoToFollowHtml();
    controller = new AbortController();
    site = actLikeTheSite([FIXTURE_PEOPLE[3] ?? { username: 'x', name: 'X' }], controller.signal);
    enabled = true;
    cards = new WhoToFollowCards({ enabled: () => enabled, signal: controller.signal });
    cards.ensure();
  });

  afterEach(() => {
    controller.abort();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('stand in for the rows, right after them, with the first person on top', () => {
    expect(list().nextElementSibling?.getAttribute('data-dnpp')).toBe('who-to-follow');
    expect(top()).toBe('Ada Park, @adapark');
    // The rows are hidden only while the cards are right after them.
    expect(document.head.querySelector('[data-dnpp="who-to-follow-style"]')?.textContent).toContain(
      'ul:has(+ [data-dnpp="who-to-follow"])',
    );
  });

  it('show just the cards: no arrows, no count', () => {
    expect(stack()).toEqual(['Ada Park', 'Tomás Reyes', 'Minji Kim']);
    expect(deck()?.querySelectorAll('.card[data-depth="0"] button').length).toBe(2);
    expect(deck()?.querySelector('[aria-label="Next person"]')).toBeNull();
  });

  it('swipe the top card away as the site’s "Not interested", with whoever it brings in joining at the back', () => {
    key('ArrowLeft');
    expect(site.dismissals).toEqual(['adapark']);

    cards.ensure();
    expect(stack()).toEqual(['Tomás Reyes', 'Minji Kim', 'Olu Adeyemi']);
  });

  it('do the same with the card’s ✕', () => {
    press('.dismiss');
    cards.ensure();

    expect(site.dismissals).toEqual(['adapark']);
    expect(stack()).toEqual(['Tomás Reyes', 'Minji Kim', 'Olu Adeyemi']);
  });

  it('follow through the site’s own button, and show it once the site has', async () => {
    press('.follow');
    expect(site.follows).toEqual(['adapark']);

    await vi.waitFor(() => {
      cards.ensure();
      expect(deck()?.querySelector('.card[data-depth="0"] .follow')?.textContent).toBe('Following');
    });
  });

  it('never mark someone you follow "Not interested": swiped, they go to the back', async () => {
    press('.follow');
    await vi.waitFor(() => {
      cards.ensure();
      expect(deck()?.querySelector('.card[data-depth="0"] .follow')?.textContent).toBe('Following');
    });

    key('ArrowRight');
    cards.ensure();

    expect(site.dismissals).toEqual([]);
    expect(stack()).toEqual(['Tomás Reyes', 'Minji Kim', 'Ada Park']);
  });

  it('keep their own order when the site’s rows change, adding newcomers at the back', () => {
    list().insertAdjacentHTML('afterbegin', suggestedRowHtml({ username: 'new', name: 'New Person' }));
    cards.ensure();

    expect(stack()).toEqual(['Ada Park', 'Tomás Reyes', 'Minji Kim']);
  });

  it('give the rows back when switched off', () => {
    enabled = false;
    cards.ensure();

    expect(deck()).toBeUndefined();
    expect(document.head.querySelector('[data-dnpp="who-to-follow-style"]')).toBeNull();
  });
});

describe('an endless stack', () => {
  let controller: AbortController;
  let cards: WhoToFollowCards;

  const nextPage = [
    { username: 'priya', name: 'Priya Nair' },
    { username: 'jonas', name: 'Jonas Berg' },
    { username: 'lena', name: 'Lena Fischer' },
  ];
  const deck = (): ShadowRoot | null | undefined => document.querySelector('[data-dnpp="who-to-follow"]')?.shadowRoot;
  const top = (): string | undefined =>
    deck()?.querySelector('.card[data-depth="0"]')?.getAttribute('aria-label')?.split(',')[0];
  const swipe = (): void => {
    deck()?.host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    cards.ensure();
  };

  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    controller = new AbortController();
  });

  afterEach(() => {
    controller.abort();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('asks the site for the next people once swiping runs it low, with its own button', () => {
    document.body.innerHTML = whoToFollowHtml();

    // No spares left: each "Not interested" leaves one fewer, until the next page comes.
    const site = actLikeTheSite([], controller.signal, [nextPage]);

    cards = new WhoToFollowCards({ enabled: () => true, signal: controller.signal });
    cards.ensure();
    swipe();

    expect(site.refreshes).toBe(1);
    cards.ensure();
    expect(top()).toBe('Priya Nair');
  });

  it('never asks before anyone has swiped, however few people there are', () => {
    document.body.innerHTML = whoToFollowHtml(FIXTURE_PEOPLE.slice(0, 2));

    const site = actLikeTheSite([], controller.signal, [nextPage]);

    cards = new WhoToFollowCards({ enabled: () => true, signal: controller.signal });
    cards.ensure();
    cards.ensure();

    expect(site.refreshes).toBe(0);
  });

  it('asks at most once a swipe, so a site with nobody left is not asked over and over', () => {
    document.body.innerHTML = whoToFollowHtml();

    // Nobody left: the next page never comes.
    const site = actLikeTheSite([], controller.signal);

    cards = new WhoToFollowCards({ enabled: () => true, signal: controller.signal });
    cards.ensure();
    swipe();
    cards.ensure();
    cards.ensure();
    expect(site.refreshes).toBe(1);

    swipe();
    expect(site.refreshes).toBe(2);
  });
});
