import http from "http";
import https from "https";

const FLIGHT_SELECTION_API_URL = process.env.FLIGHT_SELECTION_API_URL || "";
const FLIGHT_SELECTION_API_TIMEOUT_MS = Number.parseInt(
  process.env.FLIGHT_SELECTION_API_TIMEOUT_MS || "5000",
  10
);
const FLIGHT_SELECTION_PAYMENT_TYPE =
  process.env.FLIGHT_SELECTION_PAYMENT_TYPE || "ONLINE";

const isValidHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
};

const toOracleDate = (dateValue) => {
  if (typeof dateValue !== "string") {
    return dateValue;
  }

  // WhatsApp CalendarPicker typically sends YYYY-MM-DD.
  const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateValue.match(isoDatePattern);
  if (!match) {
    return dateValue;
  }

  const [, year, month, day] = match;
  return `${month}-${day}-${year}`;
};

const buildOraclePath = (pathname, FlightType, FlightDate, PaymentType) => {
  const trimmedPath = pathname.replace(/\/+$/, "");
  const oraclePathPattern = /^(.*\/getflightdata)(?:\/[^/]+\/[^/]+\/[^/]+)?$/i;
  const match = trimmedPath.match(oraclePathPattern);

  if (!match) {
    return null;
  }

  const prefix = match[1];
  return `${prefix}/${encodeURIComponent(FlightType)}/${encodeURIComponent(
    FlightDate
  )}/${encodeURIComponent(PaymentType)}`;
};

const buildRequestUrl = ({
  baseUrl,
  FlightType,
  FlightDate,
  PaymentType,
}) => {
  const parsedUrl = new URL(baseUrl);
  const oraclePath = buildOraclePath(
    parsedUrl.pathname,
    FlightType,
    FlightDate,
    PaymentType
  );

  if (oraclePath) {
    parsedUrl.pathname = oraclePath;
    parsedUrl.search = "";
    return parsedUrl;
  }

  parsedUrl.searchParams.set("FlightType", String(FlightType));
  parsedUrl.searchParams.set("FlightDate", String(FlightDate));
  parsedUrl.searchParams.set("PaymentType", String(PaymentType));
  return parsedUrl;
};

const sendGetRequest = ({ baseUrl, FlightType, FlightDate, PaymentType }) =>
  new Promise((resolve, reject) => {
    const requestUrl = buildRequestUrl({
      baseUrl,
      FlightType,
      FlightDate,
      PaymentType,
    });
    const client = requestUrl.protocol === "https:" ? https : http;

    const req = client.request(
      requestUrl,
      {
        method: "GET",
      },
      (res) => {
        let responseText = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseText += chunk;
        });
        console.log(`[Flight API] Received response with status ${res.statusCode}: ${responseText}`);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
            return;
          }
          reject(
            new Error(
              `Flight API call failed with status ${res.statusCode}: ${responseText}`
            )
          );
        });
      }
    );

    req.setTimeout(FLIGHT_SELECTION_API_TIMEOUT_MS, () => {
      req.destroy(
        new Error(
          `Flight API call timeout after ${FLIGHT_SELECTION_API_TIMEOUT_MS}ms`
        )
      );
    });

    req.on("error", reject);
    req.end();
  });

export const triggerFlightSelectionApi = async ({ FlightDate, FlightType }) => {
  if (!FlightDate || !FlightType) {
    return;
  }

  if (!FLIGHT_SELECTION_API_URL) {
    console.warn(
      "FLIGHT_SELECTION_API_URL is empty. Skipping flight selection API call."
    );
    return;
  }

  if (!isValidHttpUrl(FLIGHT_SELECTION_API_URL)) {
    console.warn(
      `Invalid FLIGHT_SELECTION_API_URL provided: ${FLIGHT_SELECTION_API_URL}`
    );
    return;
  }

  const formattedFlightDate = toOracleDate(FlightDate);
  const paymentType = FLIGHT_SELECTION_PAYMENT_TYPE;

  console.info(
    `[Flight API] Triggering GET ${FLIGHT_SELECTION_API_URL} with FlightType=${FlightType}, FlightDate=${formattedFlightDate}, PaymentType=${paymentType}`
  );

  await sendGetRequest({
    baseUrl: FLIGHT_SELECTION_API_URL,
    FlightType,
    FlightDate: formattedFlightDate,
    PaymentType: paymentType,
  });
};
