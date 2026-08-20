import { DiscountCard } from "@/components/discount-card";
import { ModeToggle } from "@/components/mode-toggle";
import { fetchShelf } from "@/lib/shelf/shelf";

export default async function Home() {
  const shelf = await fetchShelf({
    // The composition root owns the caching policy, so the data layer does not
    // have to. Nothing is cached yet — MEM-163 is where that changes.
    fetcher: (url) => fetch(url, { cache: "no-store" }),
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
          well-reviewed ones live, and this is the {shelf.discounts.length} it
          rates highest.
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
