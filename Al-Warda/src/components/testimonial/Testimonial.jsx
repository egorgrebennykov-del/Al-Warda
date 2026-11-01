import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  getFeedbacks,
  addFeedback,
  updateFeedback,
  deleteFeedback,
} from "../../../utils/feedbacks";
import decodeHtmlEntities from "../../../utils/decodeHtmlEntities";
import { useLanguage } from "../../context/languageContext";
import { useConfirm } from "../../context/ConfirmContext";
import { useAuth } from "../../context/AuthContext";
import "./Testimonial.css";

function formatReviewDate(dateString, language) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateString;
  }
}

function getInitials(firstName, lastName) {
  const f = (firstName || "").trim().charAt(0);
  const l = (lastName || "").trim().charAt(0);
  return (f + l).toUpperCase() || "?";
}

export default function Testimonial() {
  const { language, t } = useLanguage();
  const confirm = useConfirm();
  const { user, isLoggedIn: loggedIn } = useAuth();

  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // New review form state
  const [stars, setStars] = useState(0);
  const [hoverStars, setHoverStars] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Edit review state
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editStars, setEditStars] = useState(0);
  const [editHoverStars, setEditHoverStars] = useState(0);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [showOriginalMap, setShowOriginalMap] = useState({});

  const currentUserId = user?.id ?? getCookieUser()?.id;

  useEffect(() => {
    let cancelled = false;
    getFeedbacks()
      .then((items) => {
        if (cancelled) return;
        const sorted = [...items].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        );
        setFeedbacks(sorted);
      })
      .catch((err) => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    getProfile()
      .then((profile) => {
        if (!cancelled && profile) {
          setUser(profile);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    const cleanText = text.trim();
    if (!cleanText && (!stars || stars < 1)) {
      setFormError(t("testimonial.validationError"));
      return;
    }

    setSubmitting(true);
    try {
      const inserted = await addFeedback({
        userId: currentUserId,
        userFirstName: user?.firstName || "Пользователь",
        userLastName: user?.lastName || "",
        feedback: cleanText,
        stars: stars > 0 ? stars : null,
      });

      if (inserted) {
        setFeedbacks((prev) => [inserted, ...prev]);
      } else {
        const refreshed = await getFeedbacks();
        setFeedbacks(
          [...refreshed].sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at),
          ),
        );
      }

      setText("");
      setStars(0);
      setHoverStars(0);
      setFormSuccess(t("testimonial.success"));
    } catch (err) {
      setFormError(err.message || t("testimonial.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditText(item.feedback || "");
    setEditStars(item.stars || 0);
    setEditHoverStars(0);
    setActionError("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditStars(0);
    setEditHoverStars(0);
    setActionError("");
  };

  const handleSaveEdit = async (id) => {
    setActionError("");
    const cleanText = editText.trim();
    if (!cleanText && (!editStars || editStars < 1)) {
      setActionError(t("testimonial.validationError"));
      return;
    }

    setSavingId(id);
    try {
      const updated = await updateFeedback({
        id,
        userId: currentUserId,
        feedback: cleanText,
        stars: editStars > 0 ? editStars : null,
      });

      setFeedbacks((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                feedback: updated.feedback ?? cleanText,
                stars: updated.stars ?? (editStars > 0 ? editStars : null),
              }
            : item,
        ),
      );
      setEditingId(null);
    } catch (err) {
      setActionError(err.message || t("testimonial.error"));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: language === "ru" ? "Удаление отзыва" : "Delete Review",
      message: t("testimonial.confirmDelete"),
      confirmText: language === "ru" ? "Удалить" : "Delete",
      type: "danger",
    });
    if (!ok) return;

    setActionError("");
    setDeletingId(id);
    try {
      await deleteFeedback({ id, userId: currentUserId });
      setFeedbacks((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (err) {
      setActionError(err.message || t("testimonial.error"));
    } finally {
      setDeletingId(null);
    }
  };

  const activeStarCount = hoverStars || stars;
  const activeEditStarCount = editHoverStars || editStars;

  return (
    <section className="testimonial section container" id="testimonial">
      <div className="testimonial__header-box">
        <h1 className="section__title">{t("testimonial.title")}</h1>
        <p className="testimonial__subtitle">{t("testimonial.subtitle")}</p>
      </div>

      {/* Review submission block */}
      {loggedIn ? (
        <div className="testimonial__form-card">
          <h2 className="testimonial__form-title">
            <i className="ri-chat-new-line" />
            {t("testimonial.leaveReview")}
          </h2>

          {user && (
            <div className="testimonial__user-badge">
              <div className="testimonial__user-avatar">
                {getInitials(user.firstName, user.lastName)}
              </div>
              <div className="testimonial__user-info">
                <span className="testimonial__user-name">
                  {user.firstName} {user.lastName}
                </span>
                {user.email && (
                  <span className="testimonial__user-email">{user.email}</span>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {formError && (
              <div
                className="testimonial__alert testimonial__alert--error"
                role="alert"
              >
                {formError}
              </div>
            )}
            {formSuccess && (
              <div
                className="testimonial__alert testimonial__alert--success"
                role="status"
              >
                {formSuccess}
              </div>
            )}

            {/* 5-star rating selector */}
            <div className="testimonial__rating-group">
              <span className="testimonial__rating-label">
                {t("testimonial.rating")}:
              </span>
              <div
                className="testimonial__stars-picker"
                role="radiogroup"
                aria-label={t("testimonial.rating")}
              >
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`testimonial__star-btn ${
                      val <= activeStarCount
                        ? "testimonial__star-btn--filled"
                        : ""
                    }`}
                    onClick={() => setStars((current) => (current === val ? 0 : val))}
                    onMouseEnter={() => setHoverStars(val)}
                    onMouseLeave={() => setHoverStars(0)}
                    aria-label={`${val} ${val === 1 ? t("testimonial.star") : t("testimonial.stars")}`}
                  >
                    <i
                      className={
                        val <= activeStarCount
                          ? "ri-star-fill"
                          : "ri-star-line"
                      }
                    />
                  </button>
                ))}
                {stars > 0 && (
                  <>
                    <span className="testimonial__rating-text">
                      {stars} / 5
                    </span>
                    <button
                      type="button"
                      className="testimonial__rating-reset"
                      onClick={() => {
                        setStars(0);
                        setHoverStars(0);
                      }}
                    >
                      {t("testimonial.clearRating")}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Review text area */}
            <div className="testimonial__text-group">
              <label
                htmlFor="testimonial-text"
                className="testimonial__rating-label"
              >
                {t("testimonial.text")}:
              </label>
              <textarea
                id="testimonial-text"
                className="testimonial__textarea"
                rows={4}
                placeholder={t("testimonial.placeholder")}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            <div className="testimonial__form-actions">
              <button
                type="submit"
                className="button testimonial__submit-btn"
                disabled={submitting}
              >
                <i className="ri-send-plane-line" />
                {submitting
                  ? t("testimonial.submitting")
                  : t("testimonial.submit")}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="testimonial__guest-card">
          <i className="ri-chat-smile-2-line testimonial__guest-icon" />
          <p className="testimonial__guest-text">
            {t("testimonial.loginRequired")}
          </p>
          <Link
            to="/login?redirect=%2Ftestimonial"
            className="button"
          >
            {t("testimonial.loginBtn")}
          </Link>
        </div>
      )}

      {/* Reviews list sorted by date */}
      <div className="testimonial__list-section">
        <h2 className="testimonial__list-title">
          <span>{t("testimonial.title")}</span>
          {feedbacks.length > 0 && (
            <span className="testimonial__list-count">
              ({feedbacks.length})
            </span>
          )}
        </h2>

        {actionError && (
          <div
            className="testimonial__alert testimonial__alert--error"
            role="alert"
          >
            {actionError}
          </div>
        )}

        {loading && (
          <div className="testimonial__state" role="status">
            <div className="testimonial__spinner" />
            <p>{t("testimonial.loading")}</p>
          </div>
        )}

        {!loading && loadError && (
          <div className="testimonial__state" role="alert">
            <i className="ri-error-warning-line testimonial__state-icon" />
            <p>{t("testimonial.error")}</p>
          </div>
        )}

        {!loading && !loadError && feedbacks.length === 0 && (
          <div className="testimonial__state">
            <i className="ri-chat-voice-line testimonial__state-icon" />
            <p>{t("testimonial.empty")}</p>
          </div>
        )}

        {!loading && !loadError && feedbacks.length > 0 && (
          <div className="testimonial__reviews-grid">
            {feedbacks.map((item) => {
              const isOwnReview = Boolean(
                loggedIn &&
                  currentUserId != null &&
                  String(item.user_id) === String(currentUserId),
              );

              const status = item.ststus || "approved";
              const isRejected = status === "rejected";
              const isManualReview = status === "manual_review";

              // Do not display rejected reviews to the public
              if (isRejected && !isOwnReview) {
                return null;
              }

              const authorName =
                [item.user_first_name, item.user_last_name]
                  .filter(Boolean)
                  .join(" ") || t("testimonial.anonymous");
              const initials = getInitials(
                item.user_first_name,
                item.user_last_name,
              );
              const rating = Number(item.stars);
              const hasRating =
                Number.isInteger(rating) && rating >= 1 && rating <= 5;
              const originalText = decodeHtmlEntities(item.feedback || "");
              const translatedText = decodeHtmlEntities(
                (language === "ru" ? item.feedback_ru : item.feedback_en) ||
                  item.feedback ||
                  "",
              );
              const isEditing = editingId === item.id;
              const showOriginal = Boolean(showOriginalMap[item.id]);
              const displayText = showOriginal ? originalText : translatedText;
              const hasTranslation = Boolean(
                translatedText &&
                  originalText &&
                  translatedText.trim() !== originalText.trim(),
              );

              return (
                <article className="testimonial__review-card" key={item.id}>
                  {isOwnReview && isRejected && (
                    <div className="testimonial__moderation-notice testimonial__moderation-notice--rejected">
                      <i className="ri-error-warning-line" />
                      <span>{t("testimonial.rejectedNotice")}</span>
                    </div>
                  )}

                  {isOwnReview && isManualReview && (
                    <div className="testimonial__moderation-notice testimonial__moderation-notice--pending">
                      <i className="ri-time-line" />
                      <span>{t("testimonial.underReviewNotice")}</span>
                    </div>
                  )}

                  <header className="testimonial__review-header">
                    <div className="testimonial__author-box">
                      <div className="testimonial__author-avatar" aria-hidden="true">
                        {initials}
                      </div>
                      <div className="testimonial__author-meta">
                        <span className="testimonial__author-name">
                          {authorName}
                          {isOwnReview && (
                            <span className="testimonial__own-badge">
                              {language === "ru" ? "Ваш отзыв" : "Your review"}
                            </span>
                          )}
                        </span>
                        {item.created_at && (
                          <time
                            className="testimonial__date"
                            dateTime={item.created_at}
                            title={new Date(item.created_at).toISOString()}
                          >
                            <i className="ri-calendar-line" />
                            {formatReviewDate(item.created_at, language)}
                          </time>
                        )}
                      </div>
                    </div>

                    <div className="testimonial__header-right">
                      {!isEditing && hasRating && (
                        <div
                          className="testimonial__review-stars"
                          aria-label={`${rating} / 5`}
                          title={`${rating} / 5`}
                        >
                          {[1, 2, 3, 4, 5].map((star) => (
                            <i
                              key={star}
                              className={
                                star <= rating
                                  ? "ri-star-fill"
                                  : "ri-star-line testimonial__star-empty"
                              }
                            />
                          ))}
                        </div>
                      )}

                      {/* Edit / Delete actions for owner */}
                      {isOwnReview && !isEditing && (
                        <div className="testimonial__card-actions">
                          <button
                            type="button"
                            className="testimonial__card-action-btn testimonial__card-action-btn--edit"
                            onClick={() => handleStartEdit(item)}
                            title={t("testimonial.edit")}
                            aria-label={t("testimonial.edit")}
                          >
                            <i className="ri-edit-line" />
                            <span>{t("testimonial.edit")}</span>
                          </button>
                          <button
                            type="button"
                            className="testimonial__card-action-btn testimonial__card-action-btn--delete"
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                            title={t("testimonial.delete")}
                            aria-label={t("testimonial.delete")}
                          >
                            <i className="ri-delete-bin-line" />
                            <span>
                              {deletingId === item.id
                                ? t("testimonial.deleting")
                                : t("testimonial.delete")}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </header>

                  {/* Normal view vs Inline Edit view */}
                  {isEditing ? (
                    <div className="testimonial__edit-box">
                      {/* Rating selector in edit mode */}
                      <div className="testimonial__rating-group">
                        <span className="testimonial__rating-label">
                          {t("testimonial.rating")}:
                        </span>
                        <div className="testimonial__stars-picker">
                          {[1, 2, 3, 4, 5].map((val) => (
                            <button
                              key={val}
                              type="button"
                              className={`testimonial__star-btn ${
                                val <= activeEditStarCount
                                  ? "testimonial__star-btn--filled"
                                  : ""
                              }`}
                              onClick={() =>
                                setEditStars((curr) => (curr === val ? 0 : val))
                              }
                              onMouseEnter={() => setEditHoverStars(val)}
                              onMouseLeave={() => setEditHoverStars(0)}
                              aria-label={`${val} ${val === 1 ? t("testimonial.star") : t("testimonial.stars")}`}
                            >
                              <i
                                className={
                                  val <= activeEditStarCount
                                    ? "ri-star-fill"
                                    : "ri-star-line"
                                }
                              />
                            </button>
                          ))}
                          {editStars > 0 && (
                            <>
                              <span className="testimonial__rating-text">
                                {editStars} / 5
                              </span>
                              <button
                                type="button"
                                className="testimonial__rating-reset"
                                onClick={() => {
                                  setEditStars(0);
                                  setEditHoverStars(0);
                                }}
                              >
                                {t("testimonial.clearRating")}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Text in edit mode */}
                      <textarea
                        className="testimonial__edit-textarea"
                        rows={3}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder={t("testimonial.placeholder")}
                      />

                      <div className="testimonial__edit-actions">
                        <button
                          type="button"
                          className="button testimonial__edit-save-btn"
                          disabled={savingId === item.id}
                          onClick={() => handleSaveEdit(item.id)}
                        >
                          <i className="ri-check-line" />
                          <span>
                            {savingId === item.id
                              ? t("testimonial.editing")
                              : t("testimonial.save")}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="testimonial__edit-cancel-btn"
                          disabled={savingId === item.id}
                          onClick={handleCancelEdit}
                        >
                          <i className="ri-close-line" />
                          <span>{t("testimonial.cancel")}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {displayText && (
                        <p className="testimonial__review-text">
                          {displayText}
                        </p>
                      )}
                      {hasTranslation && !isEditing && (
                        <div className="testimonial__translation-meta">
                          <span
                            className="testimonial__translation-badge"
                            title="Google Gemini AI"
                          >
                            <i className="ri-translate-2" />
                            <span>{t("testimonial.translatedByAi")}</span>
                          </span>
                          <button
                            type="button"
                            className="testimonial__translation-toggle"
                            onClick={() =>
                              setShowOriginalMap((prev) => ({
                                ...prev,
                                [item.id]: !prev[item.id],
                              }))
                            }
                          >
                            {showOriginal
                              ? t("testimonial.showTranslation")
                              : t("testimonial.showOriginal")}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
