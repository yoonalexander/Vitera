import { useEffect, useState } from "react";
import { ai, type PreparedPhoto } from "./ai";

export function PhotoAttachment({ requestId }: { requestId: string }) {
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  useEffect(() => {
    let closed = false;
    ai.attachment(requestId)
      .then((result) => {
        if (!closed) setPhoto(result);
      })
      .catch((e) => {
        if (!closed) setError(String(e));
      })
      .finally(() => {
        if (!closed) setLoading(false);
      });
    return () => {
      closed = true;
    };
  }, [requestId]);
  return (
    <details>
      <summary>Meal photo</summary>
      {loading ? (
        <p role="status">Loading retained photo…</p>
      ) : photo ? (
        <>
          <figure className="photo-preview">
            <img
              src={`data:image/jpeg;base64,${photo.data}`}
              alt="Retained meal photo"
            />
            <figcaption>
              {photo.width} × {photo.height} · prepared photo without original
              metadata
            </figcaption>
          </figure>
          <p className="muted">
            Shared by all items from this photo draft. Removing it keeps
            nutrition and estimate provenance.
          </p>
          <button
            type="button"
            disabled={removing}
            onClick={async () => {
              setRemoving(true);
              setError("");
              try {
                await ai.removeAttachment(requestId);
                setPhoto(null);
              } catch (e) {
                setError(String(e));
              } finally {
                setRemoving(false);
              }
            }}
          >
            Remove retained photo
          </button>
        </>
      ) : (
        <p>No photo retained. Only estimate provenance is stored.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  );
}
