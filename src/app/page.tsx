import { connection } from "next/server";

import { ModeToggle } from "@/components/mode-toggle";
import { ShelfView } from "@/components/shelf-view";
import { describeFreshness } from "@/lib/shelf/freshness";
import { liveShelf } from "@/lib/shelf/live-shelf";
import type { ServedShelf } from "@/lib/shelf/cache";

export default async function Home() {
  // The Shelf is read per request, so rendering cannot be hoisted to build
  // time — otherwise every visitor sees whatever was discounted when the app
  // was built, and the freshness line below would be a lie. The caching lives
  // in `liveShelf`, which holds the Shelf for an hour and revalidates it
  // behind the visitor, so per-request rendering costs a memory read.
  await connection();

  const served = await liveShelf.serve();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <Masthead />
      {served === null ? <NoShelfYet /> : <Shelf served={served} />}
    </main>
  );
}

function Masthead() {
  return (
    <div className="flex items-start justify-between gap-4">
      <h1 className="text-3xl sm:text-4xl">Steampunk</h1>
      <ModeToggle />
    </div>
  );
}

function Shelf({ served: { shelf, fetchedAt } }: { served: ServedShelf }) {
  return (
    <>
      <header className="flex flex-col gap-3">
        <p className="text-muted-foreground max-w-2xl text-base text-pretty sm:text-lg">
          The best-reviewed games discounted on Steam right now. Not every
          discount — Steam has {shelf.totalRankable.toLocaleString("en-US")}{" "}
          well-reviewed ones live, and these {shelf.discounts.length} are drawn
          from the top of that ranking. Sorting, search and filters run over
          those {shelf.discounts.length}, instantly, and over nothing else.
        </p>
        {/* Rough on purpose, and the machine-readable instant is on the `time`
            element for anything that wants it exactly. What the visitor needs
            to know is whether they are looking at Steam as it is now or as it
            was when Steam last let us ask. */}
        <p className="text-muted-foreground text-sm">
          Prices as Steam had them{" "}
          <time dateTime={fetchedAt.toISOString()}>
            {describeFreshness(fetchedAt, new Date())}
          </time>
          .
        </p>
      </header>

      <ShelfView shelf={shelf} />
    </>
  );
}

/**
 * The one case with nothing to draw: a cold instance whose first assembly
 * failed. Once any Shelf has been built it is served through every later
 * failure, however stale, so this is only ever the very first visit.
 */
function NoShelfYet() {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="text-base text-pretty sm:text-lg">
        The Shelf is not built yet — Steam is not answering.
      </p>
      <p className="text-muted-foreground text-sm text-pretty">
        Steam rate-limits hard and holds the block for about half a minute
        however politely you ask afterwards, so Steampunk waits it out rather
        than making it worse. Reload in a minute and the Shelf should be here.
      </p>
      <p className="text-sm">
        <a
          href="https://store.steampowered.com/specials"
          className="underline underline-offset-4"
        >
          Browse Steam&rsquo;s discounts in the meantime
        </a>
      </p>
    </div>
  );
}
