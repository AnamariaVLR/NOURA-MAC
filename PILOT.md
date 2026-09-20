# Noura — pilot

Everything you need to use this in a supermarket. Written for you, not for a
developer.

> **Live URL:** `__LIVE_URL__`
> **Admin:** `__LIVE_URL__/admin/listings`
> **Admin password:** `VO0d0MpF9yzI`
>
> The password is also in `.env` as `ADMIN_PASSWORD`. Change it whenever you
> like — set the new value in Vercel and redeploy, and every phone that was
> signed in is signed out immediately.

---

## 1. Put it on your home screen

It takes about fifteen seconds and it matters more than it sounds: from the home
screen the app opens full-screen with no address bar, which is the difference
between something you use in an aisle and something you do not.

### iPhone — Safari

1. Open **Safari** — not Chrome. Only Safari can install a web app on iOS.
2. Go to the live URL above.
3. Tap the **Share** button — the square with an arrow coming out of the top,
   in the middle of the bottom bar.
4. Scroll the grey list down to **Add to Home Screen**.
5. The name already says **Noura**. Tap **Add**, top right.
6. The icon — a white check in a green square — is now on your home screen.

### Android — Chrome

1. Open **Chrome** and go to the live URL.
2. Either tap the **Install** banner if Chrome offers one, or:
3. Tap the **⋮** menu, top right.
4. Tap **Add to Home screen**, then **Install**.

### Check it worked

Open it from the home screen icon. If there is **no address bar at the top**, it
installed properly. If you can still see the URL, you opened the browser tab
rather than the installed app — go back to the home screen and use the icon.

---

## 2. Check a product — about 10 seconds

1. Open Noura from the home screen.
2. Tap the big green **Scan a product** button. The rear camera opens straight
   away.
3. Photograph the **front of the pack**, and get the **barcode in the frame** if
   you can. The barcode is the only part of a label that can be matched exactly;
   everything else is a guess from the name.
4. Tap **Check this product**.
5. You get the verdict, the checklist it rests on, and — if one exists — a
   better option in the same category.

**Read the checklist, not just the verdict.** Every line says what was measured
and where the number came from. A line reading *unknown* means Noura could not
find that figure: it is not a quiet fail and it is not a quiet pass.

---

## 3. Record a price check — under 30 seconds

This is the part only a person can do. No UAE grocery retailer publishes a price
API and Noura does not scrape, so every price in the app is one you wrote down.

**First time on a phone, once:**

1. Go to `__LIVE_URL__/admin/listings`.
2. Type the admin password. It is remembered on that phone for **30 days**.

**Then, in the aisle, per product:**

1. The queue leads with what has **never been checked**, then what is most
   overdue, **grouped by retailer** — so one trip down one shop is one run down
   the page.
2. Tap the row for the product in front of you.
3. Type the **price**. That is the only required field.
4. Tap **Save**.

Everything else is already filled in: your name is remembered after the first
time, the size defaults to the pack Noura tracks, stock defaults to yes, and the
date is now. A shelf photo is optional — and if it fails to upload for any
reason, **the check still saves**. You never lose the thirty seconds.

The form stays open after saving, so a row of shelf-neighbours goes quickly.

### What a price is worth

A check is good for **14 days**. Inside that window a price reads *"Verified by
hand on {date} by {name}"*. Outside it, the number is still shown — it is the
last thing anyone actually knows — but it is labelled as not recently verified,
and it stops counting: it cannot be the cheapest verified price, it cannot claim
the product is in stock, and it cannot make a product show up as a better
alternative.

**Until you record prices, no product can be recommended as an alternative.**
That is deliberate. Ten minutes of real checking in one shop makes the "better
options" block work.

---

## 4. No signal

Supermarket aisles are bad at reception, so this will happen.

- **The app still opens** from the home screen and shows a page explaining that
  the phone cannot reach the internet.
- **A scan needs signal.** Take the photo with your normal camera app, and check
  it from Noura later — the label does not change.
- **Old results are not saved on your phone, on purpose.** A verdict and a price
  are only worth showing with the date they were checked, and a cached copy
  would quietly show you last week's.
- Reception is usually better at the front of the shop.

---

## 5. What is real, and what is not

| | Status |
|---|---|
| Ingredients, nutrition, additives, allergens | **Real.** Open Food Facts, fetched by barcode, with the date |
| The checks and the verdict | **Real and repeatable.** Noura's own rubric, every threshold sourced or marked as policy — see `RUBRIC.md`. **Not yet reviewed by a nutritionist** |
| Identifying the product from a photo | **Real** when an Anthropic API key is set. Without one, every scan returns the same fixture product and the page says so |
| Prices, stock, retailers | **Only what you record.** There are no invented prices anywhere, and the app ships with none |
| UAE certificates (MOIAT, EIAC) | **Sample data, and treated as worthless.** Every shipped certificate is marked synthetic, so the certification check reads *unknown* for every product rather than pretending |
| Cosmetics and supplements | **Not assessed.** Both say so. Judging a cosmetic means checking its ingredients against the EU restricted-substance lists, and Noura does not have them |

### About the catalogue

35 products, every barcode real and verified against Open Food Facts —
`catalogue-report.md` lists every one tried, kept and dropped.

**Open Food Facts' UAE coverage is uneven, and you will feel it.** Milk, yoghurt,
water, bread and olive oil have real UAE records. Eggs, cereal and crisps do not,
so those entries are European records for the same kind of product: the checklist
is right for that record, but the barcode will not match the pack on a Dubai
shelf.

---

## 6. The five things most likely to go wrong

### 1. You scan a product and Noura says it cannot find it

**Most likely thing to happen.** Open Food Facts has a few million products and
UAE shelves have plenty it has never seen.

**What to do:** nothing is broken. Try again with the barcode square in the
frame and in focus. If it still misses, that product is not in the open database
— note it down. A pilot's most useful output is a list of what it could not
identify.

### 2. Every scan returns Coca-Cola

The app is running without an Anthropic API key, so identification is in example
mode and always returns the same fixture product. The page says *example scan*.

**What to do:** set `ANTHROPIC_API_KEY` in Vercel and redeploy. Until then the
checks, verdicts, prices and alternatives are all still real — only the "what is
this product" step is a stand-in.

### 3. Every "better options" block says *No better verified option found*

Almost certainly correct rather than broken. An alternative has to clear four
filters: same subcategory, a hand-verified in-stock check **from the last 14
days**, its own verdict must be VERIFIED, and it must rank strictly above what
you scanned.

**What to do:** record some prices (§3). With no checks recorded, nothing can
ever be recommended.

### 4. A verdict looks wrong

Look at the checklist before deciding it is a bug. Usually one of three things:

- **A line reads *unknown*.** The figure is not published; Noura will not guess.
- **The rubric is deliberately strict.** Corn flakes fail on added sugar because
  sugar is in the ingredient list, whatever the quantity.
- **The source record is wrong.** Open Food Facts is crowd-sourced. Al Rawabi
  laban reports zero sugars for a fermented milk drink, which is almost certainly
  under-reported lactose. Noura shows what the source says with the date, and
  does not silently correct it.

If it is genuinely wrong, it is a **rubric** question, and `RUBRIC.md` §9 is the
list of open questions for a nutritionist. Eggs and the sweetener rule are both
on it.

### 5. /admin asks for the password again, or shows "Not found"

**Asks again:** the 30 days lapsed, you cleared your browser data, or the
password was changed in Vercel. Type it again.

**"Not found":** `ADMIN_PASSWORD` is not set on the deployment, or is shorter
than 8 characters. A missing password closes /admin for everyone including you —
that is deliberate, so a misconfigured deploy cannot leave the price-entry form
open to the public. Set it in Vercel and redeploy.

---

## 7. What would help most from the pilot

1. **Products Noura could not identify** — the barcode, or a photo.
2. **Verdicts that felt wrong**, with what you expected instead. That is the
   input a nutritionist review needs.
3. **How long a price check actually takes** in a real aisle, holding a basket.
