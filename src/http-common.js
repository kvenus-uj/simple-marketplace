import axios from "axios";

export default axios.create({
  baseURL: "https://knklvl.xyz/api",
  headers: {
    "Content-type": "application/json"
  }
});
