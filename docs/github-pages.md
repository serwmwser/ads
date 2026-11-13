# Публикация витрины на GitHub Pages

## Что публикуется
Статические страницы из `web/public`: главная с демо-витриной, категории, все регионы и города,
комбинации категория+город для крупных городов, четыре юридических документа, 404, robots.txt, sitemap.xml.
Бэкенд, база данных, приём платежей и персональные данные пользователей на Pages не размещаются.

## Сборка
    node web/seo/build-seo.mjs --pages     # режим Pages: база /ads, origin https://serwmwser.github.io
    node web/seo/build-seo.mjs             # режим своего домена: база пустая, origin из seo.json
    node web/seo/serve.mjs                 # локальный просмотр, http://localhost:8080/ads/

Параметры хранятся в `web/seo/data/seo.json`, блок `site.pages`:
- `origin` — адрес вида https://владелец.github.io
- `basePath` — имя репозитория со слэшем, например /ads
- `indexable` — false по умолчанию: зеркало на github.io закрыто от индексации, чтобы не конкурировать
  с основным сайтом; канонические адреса и sitemap всё равно формируются
- `customDomain` — если заполнен, в сборку кладётся файл CNAME

Переопределение при сборке:
    node web/seo/build-seo.mjs --pages --base=/ads --origin=https://serwmwser.github.io --indexable

## Включение Pages
Вариант с gh:
    gh api -X POST repos/serwmwser/ads/pages -f build_type=workflow
    gh api -X PUT repos/serwmwser/ads/pages -f build_type=workflow   # если Pages уже созданы
    gh run watch --exit-status
    gh api repos/serwmwser/ads/pages --jq '.html_url,.status'

Вариант в браузере: Settings → Pages → Source: GitHub Actions. Далее любой push в main
запускает workflow `.github/workflows/pages.yml`, который собирает сайт на Node 24 и публикует артефакт.

## Свой поддомен вместо github.io
1. В `seo.json` заполните `site.pages.customDomain`, например `ads.himeet.online`, и `indexable: true`.
2. У регистратора домена создайте запись CNAME: `ads` → `serwmwser.github.io`.
3. Settings → Pages → Custom domain: укажите поддомен, дождитесь выпуска сертификата, включите Enforce HTTPS.
4. Пересоберите и отправьте изменения: `git push`.

## Важно про размещение
GitHub Pages — зарубежный хостинг. Здесь допустима только витрина без сбора персональных данных.
Рабочее приложение с телефонами, объявлениями пользователей, чатом и оплатой размещается на сервере
в Российской Федерации: там же живут база, фотографии и резервные копии. Демо-черновики в витрине
хранятся в localStorage браузера и никуда не передаются.

## Диагностика
- 404 на всех страницах: не совпадает `basePath` с именем репозитория, либо Pages не переключён на GitHub Actions.
- Страницы без стилей: сборка выполнена без флага `--pages`, из-за чего пути к ассетам идут от корня.
- Пустая витрина: не собрался `assets/demo-ads.js`, повторите сборку.
- Поиск городов молчит: не собрался `assets/geo-search.js`, нужен файл `web/seo/data/geo.json`
  (`node web/seo/fetch-geo.mjs`).
- Workflow падает на шаге Deploy: в Settings → Pages источник должен быть GitHub Actions,
  а в workflow разрешены `pages: write` и `id-token: write`.
