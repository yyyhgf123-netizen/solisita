function onKeyUpEscape(event) {
  if (event.code.toUpperCase() !== 'ESCAPE') return;

  const openDetailsElement = event.target.closest('details[open]');
  if (!openDetailsElement) return;

  const summaryElement = openDetailsElement.querySelector('summary');
  openDetailsElement.removeAttribute('open');
  summaryElement.setAttribute('aria-expanded', false);
  summaryElement.focus();
}
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
class FacetFiltersForm extends HTMLElement {
  constructor() {
    super();
    this.onActiveFilterClick = this.onActiveFilterClick.bind(this);

    this.debouncedOnSubmit = debounce((event) => {
		this.onSubmitHandler(event);
    }, 500);

    this.querySelector('form').addEventListener('input', this.debouncedOnSubmit.bind(this));

    const facetWrapper = this.querySelector('.FacetsWrapperDesktop');
    if (facetWrapper) facetWrapper.addEventListener('keyup', onKeyUpEscape);
  }
  static setListeners() {
    const onHistoryChange = (event) => {
      const searchParams = event.state ? event.state.searchParams : FacetFiltersForm.searchParamsInitial;
      if (searchParams === FacetFiltersForm.searchParamsPrev) return;
      FacetFiltersForm.renderPage(searchParams, null, false);
    }
    window.addEventListener('popstate', onHistoryChange);
  }

  static toggleActiveFacets(disable = true) {
    document.querySelectorAll('.js-facet-remove').forEach((element) => {
      element.classList.toggle('disabled', disable);
    });
  }

  static renderPage(searchParams, event, updateURLHash = true) {
    FacetFiltersForm.searchParamsPrev = searchParams;
    const sections = FacetFiltersForm.getSections();
    sections.forEach((section) => {
      const url = `${window.location.pathname}?block_id=${section.section}&${searchParams}`;
      const filterDataUrl = element => element.url === url;

      FacetFiltersForm.filterData.some(filterDataUrl) ?
        FacetFiltersForm.renderSectionFromCache(filterDataUrl, event) :
        FacetFiltersForm.renderSectionFromFetch(url, event);
    });

    if (updateURLHash) FacetFiltersForm.updateURLHash(searchParams);
  }

  static renderSectionFromFetch(url, event) {
    fetch(url)
      .then(response => response.text())
      .then((responseText) => {
        const html = responseText;
        FacetFiltersForm.filterData = [...FacetFiltersForm.filterData, { html, url }];
        FacetFiltersForm.renderFilters(html, event);
        FacetFiltersForm.renderProductGridContainer(html);
      });
  }

  static renderSectionFromCache(filterDataUrl, event) {
    const html = FacetFiltersForm.filterData.find(filterDataUrl).html;
    FacetFiltersForm.renderFilters(html, event);
    FacetFiltersForm.renderProductGridContainer(html);
  }

  static renderProductGridContainer(html) {
	const myTimeout = setTimeout(removeLoad, 1000);
	var element = document.getElementById("pre-loading");
	element.classList.add("load-product");
	document.querySelector('.pre-loading__bar').style.width = '40%'
    document.getElementById('JsCollectionProduct').innerHTML = new DOMParser().parseFromString(html, 'text/html').getElementById('JsCollectionProduct').innerHTML;
    document.querySelector('.facet-filters.sorting').innerHTML = new DOMParser().parseFromString(html, 'text/html').querySelector('.facet-filters.sorting').innerHTML;
	setTimeout(function() {
		document.querySelector('.pre-loading__bar').style.width = '100%'
	}, 500);
	function removeLoad() {
		document.querySelector('.pre-loading__bar').style.width = '0'
		element.classList.remove("load-product");
	}
	$('.product-card__image-wrapper.slider').each(function() {
        wpbingo.load_swiper_carousel($('.bwp-swiper-slider',$(this)));
	});
	if( $('.bwp_currency').length > 0){ Currency.Currency_customer(true); }
	wpbingo.click_atribute_image();
	wpbingo.zoom_thumb();
	if(window.SPR){
		SPR.initRatingHandler ();
		SPR.initDomEls ();
		SPR.loadProducts ();
		SPR.loadBadges ();
	}
	wpbingo.countdown();
	initButtons();
	initButtonsCompare();
	wpbingo.countActiveSidebar();
	wpbingo.toggleSidebar(true);
	wpbingo.sidebarCollection(true);
	wpbingo.ajaxFilterCategory();
	wpbingo.product_result_count();
	cViewCollection = wpbingo.getCookie('wpbingo_view_collection');
	if(cViewCollection){
		$('#JsCollectionProduct').removeAttr('class');
		$('#JsCollectionProduct').addClass(cViewCollection);
		$('.js-change-view').removeClass('active');
		$('[data-view='+cViewCollection+']').addClass('active');
	}
	$('.js-page-collection').on('click', '.js-change-view', function(e) {
		e.preventDefault();
		if (!$(this).hasClass('active')) {
			wpbingo.setCookie("wpbingo_view_collection", $(this).data('view'), 30);
			$('.js-change-view').removeClass('active');
			$(this).addClass('active');
			$('#JsCollectionProduct').removeAttr('class');
			$('#JsCollectionProduct').addClass($(this).data('view'));
		}
	});
  }

  static renderFilters(html, event) {
    const parsedHTML = new DOMParser().parseFromString(html, 'text/html');
    const facetDetailsElements = parsedHTML.querySelectorAll('.FacetFiltersForm .js-filter');
    const matchesIndex = (element) => {
		const jsFilter = event ? event.target.closest('.js-filter') : undefined;
		//return jsFilter ? element.dataset.index === jsFilter.dataset.index : false;
    }
    const facetsToRender = Array.from(facetDetailsElements).filter(element => !matchesIndex(element));
    const countsToRender = Array.from(facetDetailsElements).find(matchesIndex);
    facetsToRender.forEach((element) => {
		document.querySelector(`.js-filter[data-index="${element.dataset.index}"]`).innerHTML = element.innerHTML;
    });
    FacetFiltersForm.renderActiveFacets(parsedHTML);
    if (countsToRender) FacetFiltersForm.renderCounts(countsToRender, event.target.closest('.js-filter'));
  }

  static renderActiveFacets(html) {
	
    const activeFacetElementSelectors = ['.active-facets-desktop'];

    activeFacetElementSelectors.forEach((selector) => {
      const activeFacetsElement = html.querySelector(selector);
      if (!activeFacetsElement) return;
      document.querySelector(selector).innerHTML = activeFacetsElement.innerHTML;
    })

    FacetFiltersForm.toggleActiveFacets(false);
  }

  static renderCounts(source, target) {
    const targetElement = target.querySelector('.facets__selected');
    const sourceElement = source.querySelector('.facets__selected');

    if (sourceElement && targetElement) {
      target.querySelector('.facets__selected').outerHTML = source.querySelector('.facets__selected').outerHTML;
    }
  }

  static updateURLHash(searchParams) {
    history.pushState({ searchParams }, '', `${window.location.pathname}${searchParams && '?'.concat(searchParams)}`);
  }

  static getSections() {
    return [
      {
        section: document.getElementById('product-grid').dataset.id,
      }
    ]
  }

  onSubmitHandler(event) {
    event.preventDefault();
    const formData = new FormData(event.target.closest('form'));
    const searchParams = new URLSearchParams(formData).toString();
    FacetFiltersForm.renderPage(searchParams, event);
  }

  onActiveFilterClick(event) {
    event.preventDefault();
    FacetFiltersForm.toggleActiveFacets();
    const url = event.currentTarget.href.indexOf('?') == -1 ? '' : event.currentTarget.href.slice(event.currentTarget.href.indexOf('?') + 1);
    FacetFiltersForm.renderPage(url);
  }
}

FacetFiltersForm.filterData = [];
FacetFiltersForm.searchParamsInitial = window.location.search.slice(1);
FacetFiltersForm.searchParamsPrev = window.location.search.slice(1);
customElements.define('facet-filters-form', FacetFiltersForm);
FacetFiltersForm.setListeners();

class PriceRange extends HTMLElement {
  constructor() {
    super();
    this.querySelectorAll('input')
      .forEach(element => element.addEventListener('change', this.onRangeChange.bind(this)));

    this.setMinAndMaxValues();
	this.loadRangePrice();
  }

  onRangeChange(event) {
    this.adjustToValidValues(event.currentTarget);
    this.setMinAndMaxValues();
	this.loadRangePrice();
  }

  setMinAndMaxValues() {
    const inputs = this.querySelectorAll('input');
    const minInput = inputs[0];
    const maxInput = inputs[1];
    if (maxInput.value) minInput.setAttribute('max', maxInput.value);
    if (minInput.value) maxInput.setAttribute('min', minInput.value);
    if (minInput.value === '') maxInput.setAttribute('min', 0);
    if (maxInput.value === '') minInput.setAttribute('max', maxInput.getAttribute('max'));
  }

  adjustToValidValues(input) {
    const value = Number(input.value);
    const min = Number(input.getAttribute('min'));
    const max = Number(input.getAttribute('max'));

    if (value < min) input.value = min;
    if (value > max) input.value = max;
  }
  
  loadRangePrice(format) {
	var parent = document.querySelector(".facets__price");
	if(!parent) return;
    var moneyFormats = {
	  "USD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} USD"
	  },
	  "EUR": {
		"money_format": "&euro;{{amount}}",
		"money_with_currency_format": "&euro;{{amount}} EUR"
	  },
	  "GBP": {
		"money_format": "&pound;{{amount}}",
		"money_with_currency_format": "&pound;{{amount}} GBP"
	  },
	  "CAD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} CAD"
	  },
	  "ALL": {
		"money_format": "Lek {{amount}}",
		"money_with_currency_format": "Lek {{amount}} ALL"
	  },
	  "DZD": {
		"money_format": "DA {{amount}}",
		"money_with_currency_format": "DA {{amount}} DZD"
	  },
	  "AOA": {
		"money_format": "Kz{{amount}}",
		"money_with_currency_format": "Kz{{amount}} AOA"
	  },
	  "ARS": {
		"money_format": "${{amount_with_comma_separator}}",
		"money_with_currency_format": "${{amount_with_comma_separator}} ARS"
	  },
	  "AMD": {
		"money_format": "{{amount}} AMD",
		"money_with_currency_format": "{{amount}} AMD"
	  },
	  "AWG": {
		"money_format": "Afl{{amount}}",
		"money_with_currency_format": "Afl{{amount}} AWG"
	  },
	  "AUD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} AUD"
	  },
	  "BBD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} Bds"
	  },
	  "AZN": {
		"money_format": "m.{{amount}}",
		"money_with_currency_format": "m.{{amount}} AZN"
	  },
	  "BDT": {
		"money_format": "Tk {{amount}}",
		"money_with_currency_format": "Tk {{amount}} BDT"
	  },
	  "BSD": {
		"money_format": "BS${{amount}}",
		"money_with_currency_format": "BS${{amount}} BSD"
	  },
	  "BHD": {
		"money_format": "{{amount}} BD",
		"money_with_currency_format": "{{amount}} BHD"
	  },
	  "BYR": {
		"money_format": "Br {{amount}}",
		"money_with_currency_format": "Br {{amount}} BYR"
	  },
	  "BZD": {
		"money_format": "BZ${{amount}}",
		"money_with_currency_format": "BZ${{amount}} BZD"
	  },
	  "BTN": {
		"money_format": "Nu {{amount}}",
		"money_with_currency_format": "Nu {{amount}} BTN"
	  },
	  "BAM": {
		"money_format": "KM {{amount_with_comma_separator}}",
		"money_with_currency_format": "KM {{amount_with_comma_separator}} BAM"
	  },
	  "BRL": {
		"money_format": "R$ {{amount_with_comma_separator}}",
		"money_with_currency_format": "R$ {{amount_with_comma_separator}} BRL"
	  },
	  "BOB": {
		"money_format": "Bs{{amount_with_comma_separator}}",
		"money_with_currency_format": "Bs{{amount_with_comma_separator}} BOB"
	  },
	  "BWP": {
		"money_format": "P{{amount}}",
		"money_with_currency_format": "P{{amount}} BWP"
	  },
	  "BND": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} BND"
	  },
	  "BGN": {
		"money_format": "{{amount}} Ð»Ð²",
		"money_with_currency_format": "{{amount}} Ð»Ð² BGN"
	  },
	  "MMK": {
		"money_format": "K{{amount}}",
		"money_with_currency_format": "K{{amount}} MMK"
	  },
	  "KHR": {
		"money_format": "KHR{{amount}}",
		"money_with_currency_format": "KHR{{amount}}"
	  },
	  "KYD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} KYD"
	  },
	  "XAF": {
		"money_format": "FCFA{{amount}}",
		"money_with_currency_format": "FCFA{{amount}} XAF"
	  },
	  "CLP": {
		"money_format": "${{amount_no_decimals}}",
		"money_with_currency_format": "${{amount_no_decimals}} CLP"
	  },
	  "CNY": {
		"money_format": "&#165;{{amount}}",
		"money_with_currency_format": "&#165;{{amount}} CNY"
	  },
	  "COP": {
		"money_format": "${{amount_with_comma_separator}}",
		"money_with_currency_format": "${{amount_with_comma_separator}} COP"
	  },
	  "CRC": {
		"money_format": "&#8353; {{amount_with_comma_separator}}",
		"money_with_currency_format": "&#8353; {{amount_with_comma_separator}} CRC"
	  },
	  "HRK": {
		"money_format": "{{amount_with_comma_separator}} kn",
		"money_with_currency_format": "{{amount_with_comma_separator}} kn HRK"
	  },
	  "CZK": {
		"money_format": "{{amount_with_comma_separator}} K&#269;",
		"money_with_currency_format": "{{amount_with_comma_separator}} K&#269;"
	  },
	  "DKK": {
		"money_format": "{{amount_with_comma_separator}}",
		"money_with_currency_format": "kr.{{amount_with_comma_separator}}"
	  },
	  "DOP": {
		"money_format": "RD$ {{amount}}",
		"money_with_currency_format": "RD$ {{amount}}"
	  },
	  "XCD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "EC${{amount}}"
	  },
	  "EGP": {
		"money_format": "LE {{amount}}",
		"money_with_currency_format": "LE {{amount}} EGP"
	  },
	  "ETB": {
		"money_format": "Br{{amount}}",
		"money_with_currency_format": "Br{{amount}} ETB"
	  },
	  "XPF": {
		"money_format": "{{amount_no_decimals_with_comma_separator}} XPF",
		"money_with_currency_format": "{{amount_no_decimals_with_comma_separator}} XPF"
	  },
	  "FJD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "FJ${{amount}}"
	  },
	  "GMD": {
		"money_format": "D {{amount}}",
		"money_with_currency_format": "D {{amount}} GMD"
	  },
	  "GHS": {
		"money_format": "GH&#8373;{{amount}}",
		"money_with_currency_format": "GH&#8373;{{amount}}"
	  },
	  "GTQ": {
		"money_format": "Q{{amount}}",
		"money_with_currency_format": "{{amount}} GTQ"
	  },
	  "GYD": {
		"money_format": "G${{amount}}",
		"money_with_currency_format": "${{amount}} GYD"
	  },
	  "GEL": {
		"money_format": "{{amount}} GEL",
		"money_with_currency_format": "{{amount}} GEL"
	  },
	  "HNL": {
		"money_format": "L {{amount}}",
		"money_with_currency_format": "L {{amount}} HNL"
	  },
	  "HKD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "HK${{amount}}"
	  },
	  "HUF": {
		"money_format": "{{amount_no_decimals_with_comma_separator}}",
		"money_with_currency_format": "{{amount_no_decimals_with_comma_separator}} Ft"
	  },
	  "ISK": {
		"money_format": "{{amount_no_decimals}} kr",
		"money_with_currency_format": "{{amount_no_decimals}} kr ISK"
	  },
	  "INR": {
		"money_format": "Rs. {{amount}}",
		"money_with_currency_format": "Rs. {{amount}}"
	  },
	  "IDR": {
		"money_format": "{{amount_with_comma_separator}}",
		"money_with_currency_format": "Rp {{amount_with_comma_separator}}"
	  },
	  "ILS": {
		"money_format": "{{amount}} NIS",
		"money_with_currency_format": "{{amount}} NIS"
	  },
	  "JMD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} JMD"
	  },
	  "JPY": {
		"money_format": "&#165;{{amount_no_decimals}}",
		"money_with_currency_format": "&#165;{{amount_no_decimals}} JPY"
	  },
	  "JEP": {
		"money_format": "&pound;{{amount}}",
		"money_with_currency_format": "&pound;{{amount}} JEP"
	  },
	  "JOD": {
		"money_format": "{{amount}} JD",
		"money_with_currency_format": "{{amount}} JOD"
	  },
	  "KZT": {
		"money_format": "{{amount}} KZT",
		"money_with_currency_format": "{{amount}} KZT"
	  },
	  "KES": {
		"money_format": "KSh{{amount}}",
		"money_with_currency_format": "KSh{{amount}}"
	  },
	  "KWD": {
		"money_format": "{{amount}} KD",
		"money_with_currency_format": "{{amount}} KWD"
	  },
	  "KGS": {
		"money_format": "Ð»Ð²{{amount}}",
		"money_with_currency_format": "Ð»Ð²{{amount}}"
	  },
	  "LVL": {
		"money_format": "Ls {{amount}}",
		"money_with_currency_format": "Ls {{amount}} LVL"
	  },
	  "LBP": {
		"money_format": "L&pound;{{amount}}",
		"money_with_currency_format": "L&pound;{{amount}} LBP"
	  },
	  "LTL": {
		"money_format": "{{amount}} Lt",
		"money_with_currency_format": "{{amount}} Lt"
	  },
	  "MGA": {
		"money_format": "Ar {{amount}}",
		"money_with_currency_format": "Ar {{amount}} MGA"
	  },
	  "MKD": {
		"money_format": "ден {{amount}}",
		"money_with_currency_format": "ден {{amount}} MKD"
	  },
	  "MOP": {
		"money_format": "MOP${{amount}}",
		"money_with_currency_format": "MOP${{amount}}"
	  },
	  "MVR": {
		"money_format": "Rf{{amount}}",
		"money_with_currency_format": "Rf{{amount}} MRf"
	  },
	  "MXN": {
		"money_format": "$ {{amount}}",
		"money_with_currency_format": "$ {{amount}} MXN"
	  },
	  "MYR": {
		"money_format": "RM{{amount}} MYR",
		"money_with_currency_format": "RM{{amount}} MYR"
	  },
	  "MUR": {
		"money_format": "Rs {{amount}}",
		"money_with_currency_format": "Rs {{amount}} MUR"
	  },
	  "MDL": {
		"money_format": "{{amount}} MDL",
		"money_with_currency_format": "{{amount}} MDL"
	  },
	  "MAD": {
		"money_format": "{{amount}} dh",
		"money_with_currency_format": "Dh {{amount}} MAD"
	  },
	  "MNT": {
		"money_format": "{{amount_no_decimals}} &#8366",
		"money_with_currency_format": "{{amount_no_decimals}} MNT"
	  },
	  "MZN": {
		"money_format": "{{amount}} Mt",
		"money_with_currency_format": "Mt {{amount}} MZN"
	  },
	  "NAD": {
		"money_format": "N${{amount}}",
		"money_with_currency_format": "N${{amount}} NAD"
	  },
	  "NPR": {
		"money_format": "Rs{{amount}}",
		"money_with_currency_format": "Rs{{amount}} NPR"
	  },
	  "ANG": {
		"money_format": "&fnof;{{amount}}",
		"money_with_currency_format": "{{amount}} NA&fnof;"
	  },
	  "NZD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} NZD"
	  },
	  "NIO": {
		"money_format": "C${{amount}}",
		"money_with_currency_format": "C${{amount}} NIO"
	  },
	  "NGN": {
		"money_format": "&#8358;{{amount}}",
		"money_with_currency_format": "&#8358;{{amount}} NGN"
	  },
	  "NOK": {
		"money_format": "kr {{amount_with_comma_separator}}",
		"money_with_currency_format": "kr {{amount_with_comma_separator}} NOK"
	  },
	  "OMR": {
		"money_format": "{{amount_with_comma_separator}} OMR",
		"money_with_currency_format": "{{amount_with_comma_separator}} OMR"
	  },
	  "PKR": {
		"money_format": "Rs.{{amount}}",
		"money_with_currency_format": "Rs.{{amount}} PKR"
	  },
	  "PGK": {
		"money_format": "K {{amount}}",
		"money_with_currency_format": "K {{amount}} PGK"
	  },
	  "PYG": {
		"money_format": "Gs. {{amount_no_decimals_with_comma_separator}}",
		"money_with_currency_format": "Gs. {{amount_no_decimals_with_comma_separator}} PYG"
	  },
	  "PEN": {
		"money_format": "S/. {{amount}}",
		"money_with_currency_format": "S/. {{amount}} PEN"
	  },
	  "PHP": {
		"money_format": "&#8369;{{amount}}",
		"money_with_currency_format": "&#8369;{{amount}} PHP"
	  },
	  "PLN": {
		"money_format": "{{amount_with_comma_separator}} zl",
		"money_with_currency_format": "{{amount_with_comma_separator}} zl PLN"
	  },
	  "QAR": {
		"money_format": "QAR {{amount_with_comma_separator}}",
		"money_with_currency_format": "QAR {{amount_with_comma_separator}}"
	  },
	  "RON": {
		"money_format": "{{amount_with_comma_separator}} lei",
		"money_with_currency_format": "{{amount_with_comma_separator}} lei RON"
	  },
	  "RUB": {
		"money_format": "&#1088;&#1091;&#1073;{{amount_with_comma_separator}}",
		"money_with_currency_format": "&#1088;&#1091;&#1073;{{amount_with_comma_separator}} RUB"
	  },
	  "RWF": {
		"money_format": "{{amount_no_decimals}} RF",
		"money_with_currency_format": "{{amount_no_decimals}} RWF"
	  },
	  "WST": {
		"money_format": "WS$ {{amount}}",
		"money_with_currency_format": "WS$ {{amount}} WST"
	  },
	  "SAR": {
		"money_format": "{{amount}} SR",
		"money_with_currency_format": "{{amount}} SAR"
	  },
	  "STD": {
		"money_format": "Db {{amount}}",
		"money_with_currency_format": "Db {{amount}} STD"
	  },
	  "RSD": {
		"money_format": "{{amount}} RSD",
		"money_with_currency_format": "{{amount}} RSD"
	  },
	  "SCR": {
		"money_format": "Rs {{amount}}",
		"money_with_currency_format": "Rs {{amount}} SCR"
	  },
	  "SGD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} SGD"
	  },
	  "SYP": {
		"money_format": "S&pound;{{amount}}",
		"money_with_currency_format": "S&pound;{{amount}} SYP"
	  },
	  "ZAR": {
		"money_format": "R {{amount}}",
		"money_with_currency_format": "R {{amount}} ZAR"
	  },
	  "KRW": {
		"money_format": "&#8361;{{amount_no_decimals}}",
		"money_with_currency_format": "&#8361;{{amount_no_decimals}} KRW"
	  },
	  "LKR": {
		"money_format": "Rs {{amount}}",
		"money_with_currency_format": "Rs {{amount}} LKR"
	  },
	  "SEK": {
		"money_format": "{{amount_no_decimals}} kr",
		"money_with_currency_format": "{{amount_no_decimals}} kr SEK"
	  },
	  "CHF": {
		"money_format": "{{amount}} CHF",
		"money_with_currency_format": "{{amount}} CHF"
	  },
	  "TWD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} TWD"
	  },
	  "THB": {
		"money_format": "{{amount}} &#xe3f;",
		"money_with_currency_format": "{{amount}} &#xe3f; THB"
	  },
	  "TZS": {
		"money_format": "{{amount}} TZS",
		"money_with_currency_format": "{{amount}} TZS"
	  },
	  "TTD": {
		"money_format": "${{amount}}",
		"money_with_currency_format": "${{amount}} TTD"
	  },
	  "TND": {
		"money_format": "{{amount}}",
		"money_with_currency_format": "{{amount}} DT"
	  },
	  "TRY": {
		"money_format": "{{amount}}TL",
		"money_with_currency_format": "{{amount}}TL"
	  },
	  "UGX": {
		"money_format": "Ush {{amount_no_decimals}}",
		"money_with_currency_format": "Ush {{amount_no_decimals}} UGX"
	  },
	  "UAH": {
		"money_format": "₴{{amount}}",
		"money_with_currency_format": "{{amount}} UAH"
	  },
	  "AED": {
		"money_format": "Dhs. {{amount}}",
		"money_with_currency_format": "Dhs. {{amount}} AED"
	  },
	  "UYU": {
		"money_format": "${{amount_with_comma_separator}}",
		"money_with_currency_format": "${{amount_with_comma_separator}} UYU"
	  },
	  "VUV": {
		"money_format": "{{amount}} VT",
		"money_with_currency_format": "{{amount}} VT"
	  },
	  "VEF": {
		"money_format": "Bs. {{amount_with_comma_separator}}",
		"money_with_currency_format": "Bs. {{amount_with_comma_separator}} VEF"
	  },
	  "VND": {
		"money_format": "{{amount_no_decimals_with_comma_separator}}&#8363;",
		"money_with_currency_format": "{{amount_no_decimals_with_comma_separator}} VND"
	  },
	  "XBT": {
		"money_format": "{{amount_no_decimals}} BTC",
		"money_with_currency_format": "{{amount_no_decimals}} BTC"
	  },
	  "XOF": {
		"money_format": "CFA{{amount}}",
		"money_with_currency_format": "CFA{{amount}} XOF"
	  },
	  "ZMW": {
		"money_format": "K{{amount_no_decimals_with_comma_separator}}",
		"money_with_currency_format": "ZMW{{amount_no_decimals_with_comma_separator}}"
	  }
	};	
	var
	rangeS = parent.querySelectorAll("input[type=range]"),
	numberS = parent.querySelectorAll("input[type=number]");
	rangeS.forEach(function(el) {
		el.oninput = function() {
			var slide1 = parseFloat(rangeS[0].value),
				slide2 = parseFloat(rangeS[1].value);
			if (slide1 > slide2) {
				[slide1, slide2] = [slide2, slide1];
			}
			numberS[0].value = slide1;
			numberS[1].value = slide2;
			if( $('.bwp_currency').length > 0){ 
				var newCurrency = $('.field-price span.money',parent).attr('data-currency'),
				oldCurrency = window.routes.shop_currency,
				hover_currency = window.routes.hover_currency;
				var newFormat = moneyFormats[newCurrency][format || Currency.format] || '{{amount}}';
				var oldFormat = moneyFormats[oldCurrency][format || Currency.format] || '{{amount}}';
				var cents1 = Currency.convert(parseFloat(slide1, 10) * 100, oldCurrency, newCurrency);
				var cents2 = Currency.convert(parseFloat(slide2, 10)*100, oldCurrency, newCurrency);
				$('.field-price span.from span.money',parent).html(Currency.formatMoney(cents1,newFormat));
				$('.field-price span.to span.money',parent).html(Currency.formatMoney(cents2,newFormat));
				if (hover_currency){
					$('.field-price span.from span.tt_currency_txt',parent).html(slide1);
					$('.field-price span.to span.tt_currency_txt',parent).html(slide2);
				}
			}else{
				var moneyFormat = wpbingo.strings.moneyFormat;
				$('.field-price span.from',parent).html(wpbingo.Currency.formatMoney(parseFloat(slide1, 10) * 100, moneyFormat));
				$('.field-price span.to',parent).html(wpbingo.Currency.formatMoney(parseFloat(slide2, 10)*100, moneyFormat));
			}
			const width = 100*slide2/rangeS[1].max - 100*slide1/rangeS[0].max;
			const left = 100*slide1/rangeS[0].max;
			$('.slider-price',parent).css({"--width": width+"%", "--left": left+"%"});
		}
	});
	numberS.forEach(function(el) {
		el.oninput = function() {
			var number1 = parseFloat(numberS[0].value),
			number2 = parseFloat(numberS[1].value);
					
			if (number1 > number2) {
				var tmp = number1;
				numberS[0].value = number2;
				numberS[1].value = tmp;
			}
			rangeS[0].value = number1;
			rangeS[1].value = number2;
		}
	});
	const width = 100*rangeS[1].value/rangeS[1].max - 100*rangeS[0].value/rangeS[0].max;
	const left = 100*rangeS[0].value/rangeS[0].max;
	$('.slider-price',parent).css({"--width": width+"%", "--left": left+"%"});
  }
}

customElements.define('price-range', PriceRange);

class FacetRemove extends HTMLElement {
  constructor() {
    super();
    this.querySelector('a').addEventListener('click', (event) => {
      event.preventDefault();
      const form = this.closest('facet-filters-form') || document.querySelector('facet-filters-form');
      form.onActiveFilterClick(event);
    });
  }
}

customElements.define('facet-remove', FacetRemove);