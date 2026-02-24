/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { triggerFlightSelectionApi } from "./flightSelectionApi.js";

const APPOINTMENT_FLOW_RESPONSES = {
  APPOINTMENT: {
    screen: "APPOINTMENT",
    data: {
      department: [
        {
          id: "shopping",
          title: "Shopping & Groceries",
        },
        {
          id: "clothing",
          title: "Clothing & Apparel",
        },
        {
          id: "home",
          title: "Home Goods & Decor",
        },
        {
          id: "electronics",
          title: "Electronics & Appliances",
        },
        {
          id: "beauty",
          title: "Beauty & Personal Care",
        },
      ],
      location: [
        {
          id: "1",
          title: "King\u2019s Cross, London",
        },
        {
          id: "2",
          title: "Oxford Street, London",
        },
        {
          id: "3",
          title: "Covent Garden, London",
        },
        {
          id: "4",
          title: "Piccadilly Circus, London",
        },
      ],
      is_location_enabled: true,
      date: [
        {
          id: "2024-01-01",
          title: "Mon Jan 01 2024",
        },
        {
          id: "2024-01-02",
          title: "Tue Jan 02 2024",
        },
        {
          id: "2024-01-03",
          title: "Wed Jan 03 2024",
        },
      ],
      is_date_enabled: true,
      time: [
        {
          id: "10:30",
          title: "10:30",
        },
        {
          id: "11:00",
          title: "11:00",
          enabled: false,
        },
        {
          id: "11:30",
          title: "11:30",
        },
        {
          id: "12:00",
          title: "12:00",
          enabled: false,
        },
        {
          id: "12:30",
          title: "12:30",
        },
      ],
      is_time_enabled: true,
    },
  },
  DETAILS: {
    screen: "DETAILS",
    data: {
      department: "beauty",
      location: "1",
      date: "2024-01-01",
      time: "11:30",
    },
  },
  SUMMARY: {
    screen: "SUMMARY",
    data: {
      appointment:
        "Beauty & Personal Care Department at Kings Cross, London\nMon Jan 01 2024 at 11:30.",
      details:
        "Name: John Doe\nEmail: john@example.com\nPhone: 123456789\n\nA free skin care consultation, please",
      department: "beauty",
      location: "1",
      date: "2024-01-01",
      time: "11:30",
      name: "John Doe",
      email: "john@example.com",
      phone: "123456789",
      more_details: "A free skin care consultation, please",
    },
  },
  TERMS: {
    screen: "TERMS",
    data: {},
  },
};

const TRAVEL_FLOW_RESPONSES = {
  TRAVEL_SCREEN: {
    screen: "Travel_Screen",
    data: {},
  },
  FLIGHT_SCREEN: {
    screen: "Flight_screen",
    data: {
      FlightDate: "2026-01-13",
      FlightType: "D",
    },
  },
};

const SUCCESS_RESPONSE = {
  screen: "SUCCESS",
  data: {
    extension_message_response: {
      params: {
        flow_token: "REPLACE_FLOW_TOKEN",
        some_param_name: "PASS_CUSTOM_VALUE",
      },
    },
  },
};

const APPOINTMENT_FLOW_SCREENS = new Set(
  Object.values(APPOINTMENT_FLOW_RESPONSES).map((value) => value.screen)
);
const TRAVEL_FLOW_SCREENS = new Set(
  Object.values(TRAVEL_FLOW_RESPONSES).map((value) => value.screen)
);

const buildSuccessResponse = (flow_token, data = {}) => ({
  ...SUCCESS_RESPONSE,
  data: {
    extension_message_response: {
      params: {
        flow_token,
        ...data,
      },
    },
  },
});

const getAppointmentFlowInitResponse = () => ({
  ...APPOINTMENT_FLOW_RESPONSES.APPOINTMENT,
  data: {
    ...APPOINTMENT_FLOW_RESPONSES.APPOINTMENT.data,
    // these fields are disabled initially. Each field is enabled when previous fields are selected
    is_location_enabled: false,
    is_date_enabled: false,
    is_time_enabled: false,
  },
});

const handleAppointmentFlowDataExchange = (screen, data, flow_token) => {
  switch (screen) {
    case "APPOINTMENT":
      return {
        ...APPOINTMENT_FLOW_RESPONSES.APPOINTMENT,
        data: {
          ...APPOINTMENT_FLOW_RESPONSES.APPOINTMENT.data,
          is_location_enabled: Boolean(data?.department),
          is_date_enabled: Boolean(data?.department) && Boolean(data?.location),
          is_time_enabled:
            Boolean(data?.department) &&
            Boolean(data?.location) &&
            Boolean(data?.date),
          location: APPOINTMENT_FLOW_RESPONSES.APPOINTMENT.data.location.slice(
            0,
            3
          ),
          date: APPOINTMENT_FLOW_RESPONSES.APPOINTMENT.data.date.slice(0, 3),
          time: APPOINTMENT_FLOW_RESPONSES.APPOINTMENT.data.time.slice(0, 3),
        },
      };
    case "DETAILS": {
      const departmentName =
        APPOINTMENT_FLOW_RESPONSES.APPOINTMENT.data.department.find(
          (dept) => dept.id === data?.department
        )?.title ?? data?.department;
      const locationName =
        APPOINTMENT_FLOW_RESPONSES.APPOINTMENT.data.location.find(
          (loc) => loc.id === data?.location
        )?.title ?? data?.location;
      const dateName =
        APPOINTMENT_FLOW_RESPONSES.APPOINTMENT.data.date.find(
          (date) => date.id === data?.date
        )?.title ?? data?.date;

      const appointment = `${departmentName} at ${locationName}
${dateName} at ${data?.time}`;

      const details = `Name: ${data?.name}
Email: ${data?.email}
Phone: ${data?.phone}
"${data?.more_details}"`;

      return {
        ...APPOINTMENT_FLOW_RESPONSES.SUMMARY,
        data: {
          appointment,
          details,
          ...data,
        },
      };
    }
    case "SUMMARY":
      return buildSuccessResponse(flow_token);
    default:
      return null;
  }
};

const getTravelFlowInitResponse = () => ({
  ...TRAVEL_FLOW_RESPONSES.TRAVEL_SCREEN,
});

const handleTravelFlowDataExchange = (screen, data) => {
  switch (screen) {
    case "Travel_Screen": {
      const receivedFlightDate = data?.FlightDate ?? data?.calendar;
      const receivedFlightType = data?.FlightType ?? data?.appointment_type;
      const FlightDate =
        receivedFlightDate ?? TRAVEL_FLOW_RESPONSES.FLIGHT_SCREEN.data.FlightDate;
      const FlightType =
        receivedFlightType ?? TRAVEL_FLOW_RESPONSES.FLIGHT_SCREEN.data.FlightType;

      triggerFlightSelectionApi({
        FlightDate: receivedFlightDate,
        FlightType: receivedFlightType,
      }).catch((error) => {
        console.error("Failed to trigger flight selection API:", error.message);
      });

      return {
        ...TRAVEL_FLOW_RESPONSES.FLIGHT_SCREEN,
        data: {
          ...TRAVEL_FLOW_RESPONSES.FLIGHT_SCREEN.data,
          FlightDate,
          FlightType,
        },
      };
    }
    case "Flight_screen":
      return {
        ...TRAVEL_FLOW_RESPONSES.FLIGHT_SCREEN,
        data: {
          ...TRAVEL_FLOW_RESPONSES.FLIGHT_SCREEN.data,
          ...data,
        },
      };
    default:
      return null;
  }
};

export const getNextScreen = async (decryptedBody) => {
  const { screen, data, action, flow_token } = decryptedBody;
  // handle health check request
  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  // handle error notification
  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      data: {
        acknowledged: true,
      },
    };
  }

  // flow segregation at INIT time
  if (action === "INIT") {
    if (TRAVEL_FLOW_SCREENS.has(screen)) {
      return getTravelFlowInitResponse();
    }

    return getAppointmentFlowInitResponse();
  }

  if (action === "data_exchange") {
    if (TRAVEL_FLOW_SCREENS.has(screen)) {
      const travelResponse = handleTravelFlowDataExchange(screen, data);
      if (travelResponse) {
        return travelResponse;
      }
    }

    if (APPOINTMENT_FLOW_SCREENS.has(screen)) {
      const appointmentResponse = handleAppointmentFlowDataExchange(
        screen,
        data,
        flow_token
      );
      if (appointmentResponse) {
        return appointmentResponse;
      }
    }
  }

  // terminal complete action, isolated per flow
  if (action === "complete") {
    if (TRAVEL_FLOW_SCREENS.has(screen)) {
      return buildSuccessResponse(flow_token, data);
    }

    if (APPOINTMENT_FLOW_SCREENS.has(screen)) {
      return buildSuccessResponse(flow_token, data);
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
};
