# Steampunk

A web app for browsing well-reviewed games that are currently discounted on Steam,
framed by the named store campaigns those discounts belong to.

Deliberately not a complete index of Steam discounts. Showing every price cut is a
non-goal; showing ones worth buying is the goal.

## Language

**Discount**:
One game's price reduced below its list price, for a bounded window. The atomic unit
this app displays.
_Avoid_: sale, deal, special, promo

**Sale**:
A named, Steam-branded campaign that groups discounts under a theme — "Mafia Franchise
Sale", "Ukrainian Games Festival 2026". A Discount may belong to no Sale at all; most do.
_Avoid_: event, promotion, sale event

**Spotlight**:
A promotional slot on Steam's store front page. Carries a campaign label
("MIDWEEK DEAL", "FRANCHISE SALE"), an image and a link — but no dates and no list of
which games it covers.
_Avoid_: banner, feature, carousel

**Daily Deal**:
Steam's single headline Discount of the day. Distinct from a Sale — it is one game, not
a campaign.

**Discount depth**:
The percentage a price is cut by. Deliberately distinguished from **final price** — a
free game at 100% off and a $60 game at 75% off are different propositions, and ranking
by one is not ranking by the other.
_Avoid_: discount amount, savings

**Shelf**:
The fixed set of Discounts this app holds for a given region — a few hundred, not all
~10,000 live on Steam. Fetched once, then every filter, sort and search the user
performs happens *within* the Shelf. What lands on it is decided by the selection rule,
not by Steam.
_Avoid_: catalogue, corpus, index

**Rankable**:
Having enough Steam reviews to be sorted by review score. Only ~4,650 of the ~10,251
live Discounts are Rankable; the rest are excluded from the Shelf by construction.
_Avoid_: reviewed, scored, popular
