 jQuery.cookie = function(b, j, m) {
	if (typeof j != "undefined") {
		 m = m || {};
		 if (j === null) {
			 j = "";
			 m.expires = -1
		 }
		 var e = "";
		 if (m.expires && (typeof m.expires == "number" || m.expires.toUTCString)) {
			 var f;
			 if (typeof m.expires == "number") {
				 f = new Date();
				 f.setTime(f.getTime() + (m.expires * 24 * 60 * 60 * 1000))
			 } else {
				 f = m.expires
			 }
			 e = "; expires=" + f.toUTCString()
		 }
		 var l = m.path ? "; path=" + (m.path) : "";
		 var g = m.domain ? "; domain=" + (m.domain) : "";
		 var a = m.secure ? "; secure" : "";
		 document.cookie = [b, "=", encodeURIComponent(j), e, l, g, a].join("")
	 } else {
		 var d = null;
		 if (document.cookie && document.cookie != "") {
			 var k = document.cookie.split(";");
			 for (var h = 0; h < k.length; h++) {
				 var c = jQuery.trim(k[h]);
				 if (c.substring(0, b.length + 1) == (b + "=")) {
					 d = decodeURIComponent(c.substring(b.length + 1));
					 break
				 }
			 }
		 }
		 return d
	}
 };
 Shopify.Products = (function() {
	 var a = {
		 howManyToShow: 1,
		 howManyToStoreInMemory: 10,
		 wrapperId: "recently-viewed-products",
		 templateId: "recently-viewed-product-template",
		 onComplete: null
	 };
	 var c = [];
	 var h = null;
	 var d = null;
	 var e = 0;
	 var b = {
		 configuration: {
			 expires: 90,
			 path: "/",
			 domain: window.location.hostname
		 },
		 name: "shopify_recently_viewed",
		 write: function(i) {
			 jQuery.cookie(this.name, i.join(" "), this.configuration)
		 },
		 read: function() {
			 var i = [];
			 var j = jQuery.cookie(this.name);
			 if (j !== null && typeof j != "undefined") {
				 i = j.split(" ")
			 }
			 return i
		 },
		 destroy: function() {
			 jQuery.cookie(this.name, null, this.configuration)
		 },
		 remove: function(k) {
			 var j = this.read();
			 var i = jQuery.inArray(k, j);
			 if (i !== -1) {
				 j.splice(i, 1);
				 this.write(j)
			 }
		 }
	 };
	 var f = function() {
		 h.show();
		 if (a.onComplete) {
			 try {
				 a.onComplete()
			 } catch (i) {}
		 }
	 };
	 var g = function() {
		if (c.length && e < a.howManyToShow){
			const productTileTemplateUrl = "/products/"+c[0]+"?view=content";
			return fetch(productTileTemplateUrl)
			.then((res) => res.text())
			.then((res) => {
				const text = res;
				const parser = new DOMParser();
				const htmlDocument = parser.parseFromString(text, 'text/html');
				const productCard = htmlDocument.documentElement.querySelector(".product-content-card",h);
				$(".js-product-recent >.swiper-wrapper",h).append(productCard.outerHTML);
				if (c.length > 0) {
					$(".js-product-recent",h).addClass('loading');
				}
				c.shift();
				e++;
				g();
			}).catch((err) => console.error("[Shopify Content] Failed to load content for handle: "+c[0]+"", err));		
		}else {
			$(".js-product-recent",h).removeClass('loading');
			var $element = $(".js-product-recent",h);
			wpbingo.load_swiper_carousel( $element );
			$('.product-card__image-wrapper.slider',$element).each(function() {
				wpbingo.load_swiper_carousel( $('.bwp-swiper-slider',$(this)) );
			});
			initButtons("#recently-viewed-products");
			initButtonsCompare("#recently-viewed-products");
			wpbingo.countdown();
			wpbingo.click_atribute_image();
			wpbingo.zoom_thumb();
			if(window.SPR){
				SPR.initRatingHandler ();
				SPR.initDomEls ();
				SPR.loadProducts ();
				SPR.loadBadges ();
			}
			if( $('.bwp_currency').length > 0){ Currency.Currency_customer(true); }
			f();
		}
	 };
	 return {
		showRecentlyViewed: function(i) {
			if( $('#recently-viewed-products').length > 0){
				var i = i || {};
				 var count = document.querySelector("#recently-viewed-products",h);
				jQuery.extend(a, i);
				c = b.read();
				d = jQuery("#" + a.templateId);
				h = jQuery("#" + a.wrapperId);
				a.howManyToShow = count.getAttribute('data-count');
				if (a.howManyToShow && d.length && h.length && c.length) {
					g();
				}
				if (c.length == 0) {
					$('.section-recently-viewed-products').remove();
				}
			}
		},
		recordRecentlyViewed: function(l) {
			 var l = l || {};
			 jQuery.extend(a, l);
			 var j = b.read();
			 if (window.location.pathname.indexOf("/products/") !== -1) {
				 var k = window.location.pathname.match(/\/products\/([a-z0-9\-]+)/)[1];
				 var i = jQuery.inArray(k, j);
				 if (i === -1) {
					 j.unshift(k);
					 j = j.splice(0, a.howManyToStoreInMemory)
				 } else {
					 j.splice(i, 1);
					 j.unshift(k)
				 }
				 b.write(j);
			 }
		 }
	}
 })();