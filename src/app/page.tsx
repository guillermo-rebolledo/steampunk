import { connection } from "next/server";

import { DiscountCard } from "@/components/discount-card";
import { ModeToggle } from "@/components/mode-toggle";
import { fetchShelf } from "@/lib/shelf/shelf";

export default async function Home() {
  // The Shelf is fetched per request, so rendering has to wait for a real one.
  // Without this Next prerenders the page at build time and every visitor sees
  // the discounts that happened to be live when it was built. This ticket
  // caches nothing; MEM-163 is where a cache goes, in the fetcher below.
  await connection();

  const shelf = await fetchShelf({
    // `fetch` is not cached by default in this Next, so there is nothing to opt
    // out of here. Passing the fetcher in from the composition root is what
    // lets MEM-163 add caching without the data layer knowing.
    fetcher: fetch,
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl sm:text-4xl">Steampunk</h1>
          <ModeToggle />
        </div>
        <p className="text-muted-foreground max-w-2xl text-base text-pretty sm:text-lg">
          The best-reviewed games discounted on Steam right now. Not every
          discount — Steam has {shelf.totalRankable.toLocaleString("en-US")}{" "}
          well-reviewed ones live, and these {shelf.discounts.length} are drawn
          from the top of that ranking.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shelf.discounts.map((discount) => (
          <li key={discount.storeUrl} className="flex">
            <DiscountCard discount={discount} />
          </li>
        ))}
      </ul>
    </main>
  );
}
