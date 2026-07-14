# portfolio-pulse

final project proposal for oim 3690 with zhi li at babson, summer 2026.

## what i'm building

a personal portfolio dashboard for manually-tracked stock holdings, with live price data, news context on big moves, and a growth projection calculator.

## which api i'm using

Finnhub (finnhub.io). free tier. two endpoints. the quote endpoint for live prices, and the company news endpoint for headlines. no key gets committed to the repo. the key gets added through a config.js that stays gitignored.

## why i chose this

it ties to a real investing habit. i track a few 3 to 6 month stock holds in Robinhood by hand and check them most days. i want to understand why the market moves, not just watch the numbers go up and down.

## core features

a. manual portfolio entry. add a holding by ticker, shares, and cost basis. saved to localStorage and editable anytime.

b. daily price view. gain or loss per holding and a total balance. colored for up or down. a robinhood-style summary at a glance.

c. news on big moves. auto-pull recent headlines for any holding moving 2 percent or more in a day, so a big move comes with context.

d. a "worth a look" section. cross-references daily market news against 3 tagged interest areas (qsr, tech and ai, edge computing). labeled clearly as informational surfacing, not advice.

e. a projection tab. three adjustable inputs. starting balance, timeline length, and a monthly growth rate percentage that can be negative. renders a projected growth chart over the chosen timeline.

## what i don't know yet

- how Finnhub's news endpoint filters by ticker and date range. need to read the docs and test what the free tier returns.
- what charting approach to use for the projection graph. deciding between a lightweight canvas approach and a small chart library.
