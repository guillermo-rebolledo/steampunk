import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-4xl font-semibold tracking-tight">Steampunk</h1>
          <ModeToggle />
        </div>
        <p className="text-muted-foreground text-lg text-balance">
          Well-reviewed games currently discounted on Steam, framed by the sales
          they belong to.
        </p>
      </div>

      <p className="text-muted-foreground text-sm text-balance">
        Nothing is on the shelf yet — this is the scaffold. Steam has thousands
        of discounts running at any moment; Steampunk deliberately shows the
        best-reviewed slice of them rather than all of them.
      </p>

      <div>
        <Button
          render={<a href="https://store.steampowered.com/specials" />}
          size="lg"
        >
          Steam specials in the meantime
        </Button>
      </div>
    </main>
  );
}
