import http from "http";
import https from "https";

const FLIGHT_SELECTION_API_URL = process.env.FLIGHT_SELECTION_API_URL || "";
const FLIGHT_SELECTION_API_TIMEOUT_MS = Number.parseInt(
  process.env.FLIGHT_SELECTION_API_TIMEOUT_MS || "5000",
  10
);
const FLIGHT_SELECTION_PAYMENT_TYPE =
  process.env.FLIGHT_SELECTION_PAYMENT_TYPE || "ONLINE";
const TWELVE_HOURS_IN_SECONDS = 12 * 60 * 60;

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

const parseJsonResponse = (responseText) => {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new Error(`Flight API returned invalid JSON: ${error.message}`);
  }
};

const extractFlightRows = (responsePayload) => {
  if (Array.isArray(responsePayload?.data)) {
    return responsePayload.data;
  }

  if (Array.isArray(responsePayload?.items)) {
    return responsePayload.items;
  }

  if (Array.isArray(responsePayload)) {
    return responsePayload;
  }

  return [];
};

const isValidDate = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime());

const getUniqueFlightsByContent = (flightRows) => {
  const seen = new Set();
  const uniqueFlights = [];

  for (const flight of flightRows) {
    const key =
      typeof flight?.Flight_Content === "string" && flight.Flight_Content.trim()
        ? flight.Flight_Content.trim()
        : `${flight?.FLIGHT_NO || ""}|${flight?.CITY || ""}|${flight?.FLIGHT_TIME || ""
        }`;

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueFlights.push(flight);
  }

  return uniqueFlights;
};

const parseFlightDateTime = (flight) => {
  if (typeof flight?.TRAVEL_DATE_TIME === "string") {
    const parsedTravelDateTime = new Date(flight.TRAVEL_DATE_TIME);
    if (isValidDate(parsedTravelDateTime)) {
      return parsedTravelDateTime;
    }
  }

  const rawFlightDate = typeof flight?.FLIGHT_DATE === "string" ? flight.FLIGHT_DATE : "";
  const rawFlightTime = typeof flight?.FLIGHT_TIME === "string" ? flight.FLIGHT_TIME : "";
  const dateMatch = rawFlightDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (!dateMatch || !rawFlightTime) {
    return null;
  }

  const [, month, day, year] = dateMatch;
  const parsedFromParts = new Date(`${year}-${month}-${day}T${rawFlightTime}:00`);
  return isValidDate(parsedFromParts) ? parsedFromParts : null;
};

const parseUserTimeInDubai = (timeValue) => {
  const parsedTime = new Date(timeValue);
  if (!isValidDate(parsedTime)) {
    return null;
  }

  return new Date(parsedTime.getTime() + 4 * 60 * 60 * 1000);
};

const filterFlightsByTimeThreshold = (flightRows, timeValue) => {
  const uniqueFlights = getUniqueFlightsByContent(flightRows);
  const userTimeInDubai = parseUserTimeInDubai(timeValue);

  if (!isValidDate(userTimeInDubai)) {
    console.warn(
      `[Flight API] Invalid Time value "${timeValue}". Returning unique flights without time filtering.`
    );
    return uniqueFlights;
  }

  const finalFlightDetails = [];

  for (const flight of uniqueFlights) {
    const flightTimeInDubai = parseFlightDateTime(flight);
    if (!isValidDate(flightTimeInDubai)) {
      continue;
    }

    const diffMs = flightTimeInDubai.getTime() - userTimeInDubai.getTime();
    const totalSeconds = Math.floor(diffMs / 1000);
    if (totalSeconds >= TWELVE_HOURS_IN_SECONDS) {
      finalFlightDetails.push(flight);
    }
  }

  return finalFlightDetails;
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
        res.on("end", () => {
          console.log(
            `[Flight API] Received response with status ${res.statusCode}: ${responseText}`
          );
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(parseJsonResponse(responseText));
            } catch (error) {
              reject(error);
            }
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

export const triggerFlightSelectionApi = async ({
  FlightDate,
  FlightType,
  Time = new Date().toISOString(),
}) => {
  if (!FlightDate || !FlightType) {
    return [];
  }

  if (!FLIGHT_SELECTION_API_URL) {
    console.warn(
      "FLIGHT_SELECTION_API_URL is empty. Skipping flight selection API call."
    );
    return [];
  }

  if (!isValidHttpUrl(FLIGHT_SELECTION_API_URL)) {
    console.warn(
      `Invalid FLIGHT_SELECTION_API_URL provided: ${FLIGHT_SELECTION_API_URL}`
    );
    return [];
  }

  const formattedFlightDate = toOracleDate(FlightDate);
  const paymentType = FLIGHT_SELECTION_PAYMENT_TYPE;

  console.info(
    `[Flight API] Triggering GET ${FLIGHT_SELECTION_API_URL} with FlightType=${FlightType}, FlightDate=${formattedFlightDate}, PaymentType=${paymentType}`
  );

  const responsePayload = await sendGetRequest({
    baseUrl: FLIGHT_SELECTION_API_URL,
    FlightType,
    FlightDate: formattedFlightDate,
    PaymentType: paymentType,
  });

  const flightRows = extractFlightRows(responsePayload);
  const filteredFlightRows = filterFlightsByTimeThreshold(flightRows, Time);
  console.info(
    `[Flight API] Flight rows fetched=${flightRows.length}, after_12h_filter=${filteredFlightRows.length}`
  );
  return filteredFlightRows;
};
