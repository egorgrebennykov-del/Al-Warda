import { useState } from "react";

import { getImageEmbedding, cosineSimilarity } from "../utils/bookSimilarity";

export default function BookImageCompare() {
  const [imageA, setImageA] = useState(null);
  const [imageB, setImageB] = useState(null);

  const [result, setResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function compareImages() {
    if (!imageA || !imageB) {
      setError("Please select both book images.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const [embeddingA, embeddingB] = await Promise.all([
        getImageEmbedding(imageA),
        getImageEmbedding(imageB),
      ]);

      const similarity = cosineSimilarity(embeddingA, embeddingB);

      setResult(similarity);
    } catch (error) {
      console.error(error);

      setError(error.message || "Failed to compare the images.");
    } finally {
      setLoading(false);
    }
  }

  function getSimilarityText() {
    if (result === null) {
      return "";
    }

    if (result >= 0.85) {
      return "High visual similarity";
    }

    if (result >= 0.65) {
      return "Moderate visual similarity";
    }

    return "Low visual similarity";
  }

  return (
    <div>
      <h1>Book Cover Comparison</h1>

      <div>
        <label>First Book</label>

        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            setImageA(event.target.files?.[0] || null);
            setResult(null);
            setError("");
          }}
        />
      </div>

      <br />

      <div>
        <label>Second Book</label>

        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            setImageB(event.target.files?.[0] || null);
            setResult(null);
            setError("");
          }}
        />
      </div>

      <br />

      <button onClick={compareImages} disabled={loading}>
        {loading ? "Comparing..." : "Compare Books"}
      </button>

      {error && <p>{error}</p>}

      {result !== null && (
        <div>
          <h2>Result</h2>

          <p>Similarity Score: {result.toFixed(4)}</p>

          <p>{getSimilarityText()}</p>
        </div>
      )}
    </div>
  );
}
