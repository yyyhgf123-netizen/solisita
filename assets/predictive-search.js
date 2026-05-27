class PredictiveSearch extends HTMLElement {
  constructor() {
    super();
    this.input = this.querySelector('input.field__input');
    this.predictiveSearchResults = this.querySelector('[data-predictive-search]');
	this.predictiveSearchResultsArticle = this.querySelector('[data-predictive-search-article]');
    this.setupEventListeners();
  }

  setupEventListeners() {
    const form = this.querySelector('form.search');
    form.addEventListener('submit', this.onFormSubmit.bind(this));

    this.input.addEventListener('input', debounce((event) => {
      this.onChange(event);
    }, 300).bind(this));
    this.input.addEventListener('focus', this.onFocus.bind(this));

    this.addEventListener('focusout', this.onFocusOut.bind(this));
    this.addEventListener('keyup', this.onKeyup.bind(this));
    this.addEventListener('keydown', this.onKeydown.bind(this));
  }

  getQuery() {
    return this.input.value.trim();
  }

  onChange() {
    const searchTerm = this.getQuery();

    if (!searchTerm.length) {
      this.close(true);
      return;
    }

    this.getSearchResults(searchTerm);
  }

  onFormSubmit(event) {
    if (!this.getQuery().length || this.querySelector('[aria-selected="true"] a')) event.preventDefault();
  }

  onFocus() {
    const searchTerm = this.getQuery();

    if (!searchTerm.length) return;

    if (this.getAttribute('results') === 'true') {
      this.open();
    } else {
      this.getSearchResults(searchTerm);
    }
  } 

  onFocusOut() {
    setTimeout(() => {
      if (!this.contains(document.activeElement)) this.close();
    })
  }

	onKeyup(event) {
		if (!this.getQuery().length){
			this.close(true);
			$('form.search-modal__form .predictive-search-content').css("display", "none");
      $('.header__search-form .close-search-form').css("display", "none");
		}
		event.preventDefault();
		switch (event.code) {
			case 'ArrowUp':
				this.switchOption('up')
				break;
			case 'ArrowDown':
				this.switchOption('down');
				break;
			case 'Enter':
				this.selectOption();
				break;
		}
	}

  onKeydown(event) {
    // Prevent the cursor from moving in the input when using the up and down arrow keys
    if (
      event.code === 'ArrowUp' ||
      event.code === 'ArrowDown'
    ) {
      event.preventDefault();
    }
  }

  switchOption(direction) {
    if (!this.getAttribute('open')) return;
    
    const moveUp = direction === 'up';
    const selectedElement = this.querySelector('[aria-selected="true"]');
    const allElements = this.querySelectorAll('li');
    let activeElement = this.querySelector('li');

    if (moveUp && !selectedElement) return;

    this.statusElement.textContent = ''; 

    if (!moveUp && selectedElement) {
      activeElement = selectedElement.nextElementSibling || allElements[0];
    } else if (moveUp) {
      activeElement = selectedElement.previousElementSibling || allElements[allElements.length - 1];
    }

    if (activeElement === selectedElement) return;

    activeElement.setAttribute('aria-selected', true);
    if (selectedElement) selectedElement.setAttribute('aria-selected', false);
 
    this.setLiveRegionText(activeElement.textContent);
    this.input.setAttribute('aria-activedescendant', activeElement.id);
  }

  selectOption() {
    const selectedProduct = this.querySelector('[aria-selected="true"] a, [aria-selected="true"] button');

    if (selectedProduct) selectedProduct.click();
  }

  getSearchResults(searchTerm) {
    const queryKey = searchTerm.replace(" ", "-").toLowerCase();
    this.setLiveRegionLoadingState();
	
    fetch(`${routes.predictive_search_url}?q=${encodeURIComponent(searchTerm)}&${encodeURIComponent('resources[type]')}=product&section_id=predictive-search`)
      .then((response) => { 
        if (!response.ok) {
          var error = new Error(response.status);
          this.close();
          throw error;
        }

        return response.text();
      })
      .then((text) => {
        const resultsMarkup = new DOMParser().parseFromString(text, 'text/html').querySelector('#predictive-search-product').innerHTML;
        this.renderSearchResults(resultsMarkup,queryKey);
      })
      .catch((error) => {
        this.close();
        throw error;
      });
  
    fetch(`${routes.predictive_search_url}?q=${encodeURIComponent(searchTerm)}&${encodeURIComponent('resources[type]')}=article&section_id=predictive-search`)
      .then((response) => { 
        if (!response.ok) {
          var error = new Error(response.status);
          this.close();
          throw error;
        }

        return response.text();
      })
      .then((text) => {
        const resultsMarkup = new DOMParser().parseFromString(text, 'text/html').querySelector('#predictive-search-blog').innerHTML;
        this.renderSearchResultsArticle(resultsMarkup,queryKey);
      })
      .catch((error) => {
        this.close();
        throw error;
      }); 
	}  

  setLiveRegionLoadingState() {
    this.statusElement = this.statusElement || this.querySelector('.predictive-search-status');
    this.loadingText = this.loadingText || this.getAttribute('data-loading-text');

    this.setLiveRegionText(this.loadingText);
    this.setAttribute('loading', true);
  }

  setLiveRegionText(statusText) {
    this.statusElement.setAttribute('aria-hidden', 'false');
    this.statusElement.textContent = statusText;
    
    setTimeout(() => {
      this.statusElement.setAttribute('aria-hidden', 'true');
    }, 1000);
  }

	renderSearchResults(resultsMarkup,queryKey) {
		this.predictiveSearchResults.innerHTML = resultsMarkup;
		this.setAttribute('results', true);  
		this.setLiveRegionResults();
		var url = '/search?q='+queryKey+'&type=product';
		$('[data-predictive-search] [data-view-all-product]').attr('href', url);
		this.open();
	}  
	renderSearchResultsArticle(resultsMarkup,queryKey) {
		if(this.predictiveSearchResultsArticle){
			this.predictiveSearchResultsArticle.innerHTML = resultsMarkup;
			this.setAttribute('results', true);  
			var url = '/search?q='+queryKey+'&type=article';
			$('[data-predictive-search-article] [data-view-all-article]').attr('href', url);
			this.setLiveRegionResults();
			this.open();
		}
	}
	setLiveRegionResults() { 
		this.removeAttribute('loading');
	} 
	getResultsMaxHeight() {
		this.resultsMaxHeight = window.innerHeight - document.getElementById('shopify-section-header').getBoundingClientRect().bottom;
		return this.resultsMaxHeight;
	}
   open() {
    this.setAttribute('open', true);
    this.input.setAttribute('aria-expanded', true);
	$('form.search-modal__form .predictive-search-content').removeAttr('style');
  $('.header__search-form .close-search-form').css("display", "block");
  }

  close(clearSearchTerm = false) { 
    if (clearSearchTerm) {
      this.input.value = '';
      this.removeAttribute('results');
    }

    const selected = this.querySelector('[aria-selected="true"]');

    if (selected) selected.setAttribute('aria-selected', false);

    this.input.setAttribute('aria-activedescendant', '');
    this.removeAttribute('open');
    this.input.setAttribute('aria-expanded', false);
  }
}

customElements.define('predictive-search', PredictiveSearch);
