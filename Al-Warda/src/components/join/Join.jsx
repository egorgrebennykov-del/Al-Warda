import { useLanguage } from "../../context/languageContext";

export default function Join() {
  const { t } = useLanguage();

  return (
    <section className="join section">
      <div className="join__container">
        <img src="assets/img/join-bg.jpg" alt="image" className="join__bg" />
        <div className="join__data container grid">
          <h2 className="join__title section__title" style={{ whiteSpace: "pre-line" }}>
            {t("join.title")}
          </h2>
          <form action="" className="join__form" onSubmit={(e) => e.preventDefault()}>
            <input
              type="email"
              placeholder={t("join.placeholder")}
              className="join__input"
            />
            <button type="submit" className="join__button button">
              {t("join.button")}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
