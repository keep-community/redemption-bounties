import React from "react"
import PropTypes from "prop-types"

const TLogo = ({ width, height }) => {
  return (
    <svg
      className="tlogo"
      width={width}
      height={height}
      viewBox="-2 -2 110 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M48.4087 57.7096H34.1487V48.7896H72.9787V57.7096H58.7187V76.8096H48.4087V57.7096Z"
        fill="#111010"
      />
      <path
        d="M53.9187 39.6496C56.774 39.6496 59.0887 37.3349 59.0887 34.4796C59.0887 31.6243 56.774 29.3096 53.9187 29.3096C51.0634 29.3096 48.7487 31.6243 48.7487 34.4796C48.7487 37.3349 51.0634 39.6496 53.9187 39.6496Z"
        fill="#111010"
      />
      <circle cx="53" cy="53" r="49.5" stroke="#111010" strokeWidth="10" />
    </svg>
  )
}

TLogo.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
}

export default TLogo
