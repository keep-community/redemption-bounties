import farmerImage from '../images/bounty-farmer.png'
import "./index.css"

export default function Footer() {
    return (<div id="footer">
        <img src={farmerImage} className="farmer-image" alt="farmer" />
    </div>)
  }