function EffectSlicer({ swiper: e, extendParams: t, on: s, emit: i }) {
    t({ slicerEffect: { split: 5 } });

    const r = (t) => {
        e.slides.forEach((slide) => {
            const clones = slide.querySelectorAll(".swiper-slicer-image-clone");
            const content = slide.querySelector(".swiper-slide-content");

            if (content) {
                content.style.transitionDuration = `${t}ms`;
            }

            clones.forEach((clone, index) => {
                if (t === 0) {
                    clone.style.transitionTimingFunction = "ease-out";
                    clone.style.transitionDuration = `${e.params.speed + (e.params.speed / (clones.length - 1)) * (clones.length - index - 1)}ms`;
                } else {
                    clone.style.transitionTimingFunction = "";
                    clone.style.transitionDuration = `${t + (t / (clones.length - 1)) * (clones.length - index - 1)}ms`;
                }
            });
        });

        if (t !== 0) {
            const { slides, activeIndex, wrapperEl } = e;
let triggered = false;
const activeSlide = slides[activeIndex];
if (!activeSlide) return;

const firstClone = activeSlide.querySelector(".swiper-slicer-image-clone:nth-child(1)");
if (firstClone) {
  const handler = function () {
    if (triggered) return;
    triggered = true;
    firstClone.removeEventListener('transitionend', handler);
    e.animating = false;

    const events = ["webkitTransitionEnd", "transitionend"];
    events.forEach(evt => {
      const event = new Event(evt, { bubbles: true });
      wrapperEl.dispatchEvent(event);
    });
  };

  firstClone.addEventListener('transitionend', handler);
}
        }
    };

    s("beforeInit", () => {
        if (e.params.effect !== "slicer") return;
        e.classNames.push("swiper-slicer");

        const overwriteParams = {
            slidesPerView: 1,
            slidesPerGroup: 1,
            watchSlidesProgress: true,
            spaceBetween: 0,
            virtualTranslate: true
        };
        Object.assign(e.params, overwriteParams);
        Object.assign(e.originalParams, overwriteParams);
    });

    s("init", () => {
        if (e.params.effect !== "slicer") return;

        e.slides.forEach((slide) => {
            const original = slide.querySelector(".swiper-slicer-image");
            if (!original) return;

            const container = document.createElement("div");
            container.classList.add("swiper-slicer-image-clones");

            for (let i = 0; i < e.params.slicerEffect.split; i++) {
                const cloneWrapper = document.createElement("div");
                cloneWrapper.classList.add("swiper-slicer-image-clone");
                const clone = original.cloneNode(true);
                cloneWrapper.appendChild(clone);
                container.appendChild(cloneWrapper);
            }

            const next = original.nextElementSibling;
            next ? original.parentNode.insertBefore(container, next) : original.parentNode.appendChild(container);
        });

        i("setTranslate", e, e.translate);
    });

    s("setTranslate", () => {
    if (e.params.effect !== "slicer") return;
    const axis = e.isHorizontal() ? "X" : "Y";

    e.slides.forEach((slide, index) => {
        slide.style.transform = `translate${axis}(-${100 * index}%)`;
        const progress = slide.progress;

        const content = slide.querySelector(".swiper-slide-content");
        if (content) {
            content.style.transform = `translate${axis}(${e.size * -progress * 1.2}px)`;
        }

        slide.querySelectorAll(".swiper-slicer-image-clone").forEach((clone) => {
            const prog = -progress;
            if (Math.abs(progress) < 0.001) {
                clone.style.transform = `translate${axis}(0)`;
            } else {
                clone.style.transform = `translate${axis}(${100 * prog}%)`;
            }
        });
    });
});

    s("setTransition", (_, duration) => {
        if (e.params.effect !== "slicer") return;
        r(duration);
    });

    s("resize init", () => {
        if (e.params.effect !== "slicer") return;

        const split = e.params.slicerEffect.split;
        const isHorizontal = e.isHorizontal();

        e.el.querySelectorAll(".swiper-slicer-image").forEach((img) => {
            img.style.width = `${e.width}px`;
            img.style.height = `${e.height}px`;
        });

        e.slides.forEach((slide) => {
            slide.querySelectorAll(".swiper-slicer-image-clone").forEach((clone, i) => {
                const img = clone.querySelector(".swiper-slicer-image");
                if (isHorizontal) {
                    clone.style.height = `${100 / split}%`;
                    clone.style.top = `${100 / split * i}%`;
                    img.style.top = `-${100 * i}%`;
                } else {
                    clone.style.width = `${100 / split}%`;
                    clone.style.left = `${100 / split * i}%`;
                    img.style.left = `-${100 * i}%`;
                }
            });
        });
    });
}
